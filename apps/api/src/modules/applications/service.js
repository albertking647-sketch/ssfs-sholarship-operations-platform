import { config } from "../../config.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { createId } from "../../lib/ids.js";
import { buildApplicationImportPreview } from "./import.js";
import { buildInterviewImportPreview } from "./interviewImport.js";
import { buildApplicationScreeningAssessment } from "./screening.js";

const PREVIEW_DISPLAY_LIMIT = 500;
const IMPORT_RESULT_DISPLAY_LIMIT = 60;
const APPLICATION_MESSAGE_SENDER = config.messaging.senderEmail;
const APPLICATION_MESSAGE_SENDER_NAME = config.messaging.senderName;
const APPLICATION_MESSAGE_SIGNATURE = [
  "Best regards,",
  "Student Support and Financial Services, DoSA",
  "KNUST"
];

let applicationsExportWorkbookFactoryPromise = null;

async function loadApplicationsExportWorkbookFactory() {
  if (!applicationsExportWorkbookFactoryPromise) {
    applicationsExportWorkbookFactoryPromise = import("./exportWorkbook.js")
      .then((module) => module.buildApplicationsExportWorkbook)
      .catch((error) => {
        applicationsExportWorkbookFactoryPromise = null;
        throw error;
      });
  }

  return applicationsExportWorkbookFactoryPromise;
}

function assertRequiredString(value, field, label) {
  if (!String(value || "").trim()) {
    throw new ValidationError(`${label} is required.`, { field });
  }
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError("Numeric fields must contain valid numbers.");
  }

  return parsed;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) {
    return null;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
  if (!emailPattern.test(email)) {
    throw new ValidationError("Email address must be valid.", { field: "email" });
  }

  return email;
}

function normalizeMessageDraftValue(value, fallback, field) {
  const raw = value === undefined || value === null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  return raw;
}

function normalizeRecipientEdits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      String(key),
      {
        email: normalizeEmail(entry?.email),
        phone: normalizeStringOrNull(entry?.phone)
      }
    ])
  );
}

function renderEmailBodyAsHtml(body) {
  return String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => (line ? `<p>${line.replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    })[char])}</p>` : "<p>&nbsp;</p>"))
    .join("");
}

function normalizeDocumentChecklist(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const label = String(item || "").trim();
        return label ? { label, received: false } : null;
      }

      const label = String(item?.label || "").trim();
      if (!label) return null;
      return {
        label,
        received: Boolean(item?.received)
      };
    })
      .filter(Boolean);
}

function normalizeMessageType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "interview_invite",
      "award_notice",
      "disqualified_notice",
      "not_selected_notice"
    ].includes(normalized)
  ) {
    return normalized;
  }
  return null;
}

function normalizeMessagingChannel(value) {
  const normalized = String(value || "email").trim().toLowerCase();
  if (["email", "sms", "whatsapp"].includes(normalized)) {
    return normalized;
  }
  return "email";
}

function normalizeStringOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

  function normalizeInterviewStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["pending", "scheduled", "completed", "waived"].includes(normalized)) {
      return normalized;
    }
    return null;
  }

  function normalizeOutcomeDecision(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["awarded", "not_selected"].includes(normalized)) {
      return normalized;
    }
    return null;
  }

function normalizeExportFontName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "century gothic") {
    return "Century Gothic";
  }

  return "Constantia";
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/\b\d{4}\/\d{4}\b/);
  return match ? match[0] : text;
}

function toDisplayLabel(value) {
  return String(value || "")
    .trim()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function pushHistoryEvent(events, event) {
  const timestamp = event?.timestamp || null;
  if (!timestamp) {
    return;
  }

  events.push({
    id: event.id || `history-${events.length + 1}`,
    category: event.category || "update",
    title: event.title || "Application update",
    description: event.description || "",
    timestamp,
    actorName: event.actorName || null,
    tone: event.tone || "neutral",
    meta: Array.isArray(event.meta) ? event.meta.filter(Boolean) : []
  });
}

function collapseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function hasNameMismatch(uploadedName, registryName) {
  const left = collapseName(uploadedName);
  const right = collapseName(registryName);
  return Boolean(left && right && left !== right);
}

function hasReferenceMismatch(uploadedReferenceId, registryReferenceId) {
  const left = normalizeStringOrNull(uploadedReferenceId);
  const right = normalizeStringOrNull(registryReferenceId);
  return Boolean(left && right && left !== right);
}

function hasApplicantMismatch(
  uploadedName,
  registryName,
  uploadedReferenceId,
  registryReferenceId
) {
  return (
    hasNameMismatch(uploadedName, registryName) ||
    hasReferenceMismatch(uploadedReferenceId, registryReferenceId)
  );
}

  function buildPreviewResponse(preview) {
    const rows = preview.rows.slice(0, PREVIEW_DISPLAY_LIMIT);
    return {
      summary: preview.summary,
    rows,
    returnedRows: rows.length,
      truncated: rows.length < preview.rows.length
    };
  }

async function assessInterviewImportPreview(payload, repositories, validateContext) {
    await validateContext(payload);
    const preview = buildInterviewImportPreview(payload.rows || [], payload);
    const applications = await repositories.applications.list({
      schemeId: payload.schemeId,
      cycleId: payload.cycleId
    });

    const byReferenceId = new Map();
    const byIndexNumber = new Map();
    for (const application of applications) {
      if (application.studentReferenceId) {
        byReferenceId.set(String(application.studentReferenceId).trim(), application);
      }
      if (application.indexNumber) {
        byIndexNumber.set(String(application.indexNumber).trim(), application);
      }
    }

    let matchedRows = 0;
    let unmatchedRows = 0;
    const rows = preview.rows.map((row) => {
      const issues = [...row.issues];
      const referenceId = row.payload.studentReferenceId ? String(row.payload.studentReferenceId).trim() : "";
      const indexNumber = row.payload.indexNumber ? String(row.payload.indexNumber).trim() : "";
      const matchedApplication =
        (referenceId && byReferenceId.get(referenceId)) ||
        (indexNumber && byIndexNumber.get(indexNumber)) ||
        null;

      if (!matchedApplication) {
        issues.push("No application in the active scheme and academic year matches this interview row.");
        unmatchedRows += 1;
      } else {
        matchedRows += 1;
      }

      return {
        ...row,
        status: issues.length ? "invalid" : "valid",
        issues,
        matchedApplication
      };
    });

    return {
      summary: {
        totalRows: preview.summary.totalRows,
        validRows: rows.filter((row) => row.status === "valid").length,
        invalidRows: rows.filter((row) => row.status === "invalid").length,
        matchedRows,
        unmatchedRows
      },
      rows
    };
}

export function createApplicationService({ repositories }) {
  async function getCriteriaWithCache(schemeId, cycleId, cache) {
    const key = `${schemeId || ""}:${cycleId || ""}`;
    if (cache.has(key)) {
      return cache.get(key);
    }

    const criteria = await repositories.applicationCriteria.getBySchemeCycle(schemeId, cycleId);
    cache.set(key, criteria || null);
    return criteria || null;
  }

  function attachScreeningAssessment(item, criteria) {
    const isRecommendationQualified =
      String(item?.recommendationStatus || "").trim().toLowerCase() === "recommended_student" &&
      String(item?.reviewDecision || "").trim().toLowerCase() === "qualified";

    if (isRecommendationQualified) {
      return {
        ...item,
        screeningAssessment: {
          configured: true,
          state: "ready",
          recommendedDecision: "qualified",
          summary: "This record was added from Recommended Students and is treated as already screening-cleared.",
          checks: [
            {
              key: "recommended_student",
              label: "Recommendation intake",
              status: "pass",
              message:
                "Recommended students enter Applications as already qualified and screening-cleared."
            }
          ]
        }
      };
    }

    return {
      ...item,
      screeningAssessment: buildApplicationScreeningAssessment({
        criteria,
        application: item,
        nameMismatchFlag: Boolean(item?.nameMismatchFlag)
      })
    };
  }

  async function enrichApplications(items) {
    const criteriaCache = new Map();
    const enriched = [];

    for (const item of items || []) {
      const criteria = await getCriteriaWithCache(item.schemeId, item.cycleId, criteriaCache);
      enriched.push(attachScreeningAssessment(item, criteria));
    }

    return enriched;
  }

  async function enrichApplication(item) {
    if (!item) {
      return null;
    }

    const criteria = await repositories.applicationCriteria.getBySchemeCycle(item.schemeId, item.cycleId);
    return attachScreeningAssessment(item, criteria);
  }

  async function validateContext(payload) {
    assertRequiredString(payload.schemeId, "schemeId", "Scheme");
    assertRequiredString(payload.cycleId, "cycleId", "Academic year");

    const scheme = await repositories.schemes.getById(payload.schemeId);
    if (!scheme) {
      throw new NotFoundError("The selected scheme does not exist.");
    }

    const cycle = await repositories.cycles.getById(payload.cycleId);
    if (!cycle) {
      throw new NotFoundError("The selected academic year does not exist.");
    }

    return { scheme, cycle };
  }

  function applicationStatusFromMode(importMode) {
    switch ((importMode || "").trim().toLowerCase()) {
      case "selected":
      case "selected_applicants":
      case "selected applicants":
        return "recommended";
      case "award":
      case "award_list":
      case "award list":
        return "awarded";
      case "waitlist":
      case "waitlist_candidates":
      case "waitlist candidates":
        return "recommended";
      default:
        return "submitted";
    }
  }

  function recommendationStatusFromMode(importMode) {
    switch ((importMode || "").trim().toLowerCase()) {
      case "selected":
      case "selected_applicants":
      case "selected applicants":
        return "recommended";
      case "award":
      case "award_list":
      case "award list":
        return "recommended";
      case "waitlist":
      case "waitlist_candidates":
      case "waitlist candidates":
        return "recommended";
      default:
        return null;
    }
  }

  function toEligibilityStatus(reviewDecision) {
    switch (reviewDecision) {
      case "qualified":
        return "eligible";
      case "disqualified":
        return "ineligible";
      case "pending":
      default:
        return "requires_review";
    }
  }

  function toApplicationStatus(reviewDecision, currentStatus) {
    if (["recommended", "waitlisted", "awarded", "not_selected"].includes(currentStatus)) {
      return currentStatus;
    }

    switch (reviewDecision) {
      case "disqualified":
        return "rejected";
      case "qualified":
      case "pending":
      default:
        return "screened";
    }
  }

  function getMessageTypeScope(messageType) {
    switch (messageType) {
      case "interview_invite":
        return { qualificationStatus: "qualified" };
      case "award_notice":
        return { outcomeDecision: "awarded" };
      case "disqualified_notice":
        return { qualificationStatus: "disqualified" };
      case "not_selected_notice":
        return { outcomeDecision: "not_selected" };
      default:
        return {};
    }
  }

  function buildPhoneMessageTemplate(messageType, context, channel) {
    const schemeName = context.scheme?.name || "the selected scheme";
    const academicYear = context.cycle?.label || "the selected academic year";
    const channelLabel = channel === "whatsapp" ? "WhatsApp" : "SMS";

    switch (messageType) {
      case "interview_invite":
        return {
          subjectLine: "",
          bodyTemplate: `Dear {{applicantName}}, your ${schemeName} application for ${academicYear} has been shortlisted for interview. Date: {{interviewDate}}. Venue: {{interviewVenue}}. SSFS KNUST`
        };
      case "award_notice":
        return {
          subjectLine: "",
          bodyTemplate: `Dear {{applicantName}}, your ${schemeName} application for ${academicYear} has been successful. Further award details will follow from SSFS KNUST via ${channelLabel}.`
        };
      case "disqualified_notice":
        return {
          subjectLine: "",
          bodyTemplate: `Dear {{applicantName}}, your ${schemeName} application for ${academicYear} could not proceed. Reason: {{reviewReason}}. SSFS KNUST`
        };
      case "not_selected_notice":
        return {
          subjectLine: "",
          bodyTemplate: `Dear {{applicantName}}, after the full selection process for ${schemeName} in ${academicYear}, your application was not selected for award. SSFS KNUST`
        };
      default:
        return {
          subjectLine: "",
          bodyTemplate: `Dear {{applicantName}}, this is an update on your ${schemeName} application for ${academicYear}. SSFS KNUST`
        };
    }
  }

  function buildMessageTemplate(messageType, context, channel = "email") {
    if (channel === "sms" || channel === "whatsapp") {
      return buildPhoneMessageTemplate(messageType, context, channel);
    }

    const schemeName = context.scheme?.name || "the selected scheme";
    const academicYear = context.cycle?.label || "the selected academic year";

    switch (messageType) {
      case "interview_invite":
        return {
          subjectLine: `${schemeName}: Interview Invitation`,
          bodyTemplate: [
            "Dear {{applicantName}},",
            "",
            `We are pleased to inform you that your application under ${schemeName} for the ${academicYear} academic year has been shortlisted for interview.`,
            "",
            "Your interview is scheduled as follows:",
            "Date: {{interviewDate}}",
            "Venue: {{interviewVenue}}",
            "",
            ...APPLICATION_MESSAGE_SIGNATURE
          ].join("\n")
        };
      case "award_notice":
        return {
          subjectLine: `${schemeName}: Award Notification`,
          bodyTemplate: [
            "Dear {{applicantName}},",
            "",
            `We are pleased to inform you that your application under ${schemeName} for the ${academicYear} academic year has been successful.`,
            "",
            "You have been selected for award under this scheme.",
            "Further information on the next steps will be communicated in due course.",
            "",
            ...APPLICATION_MESSAGE_SIGNATURE
          ].join("\n")
        };
      case "waitlist_notice":
        return {
          subjectLine: `${schemeName}: Legacy Waitlist Update`,
          bodyTemplate: [
            "Dear {{applicantName}},",
            "",
            `Thank you for your application to ${schemeName} for the ${academicYear} academic year.`,
            "",
            "This legacy notice reflects an older workflow where your application was placed on a waitlist for later consideration.",
            "",
            "You will be contacted if your status changes.",
            "",
            ...APPLICATION_MESSAGE_SIGNATURE
          ].join("\n")
        };
      case "disqualified_notice":
        return {
          subjectLine: `Update on your ${schemeName} application`,
          bodyTemplate: [
            "Dear {{applicantName}},",
            "",
            `Thank you for applying for ${schemeName} for ${academicYear}.`,
            "",
            "After review, we regret to inform you that your application was not able to proceed.",
            "Reason:",
            "{{reviewReason}}",
            "",
            "We appreciate your interest.",
            "",
            ...APPLICATION_MESSAGE_SIGNATURE
          ].join("\n")
        };
      case "not_selected_notice":
        return {
          subjectLine: `${schemeName} Final Outcome`,
          bodyTemplate: [
            "Dear {{applicantName}},",
            "",
            `Thank you for your interest in ${schemeName} for the ${academicYear} academic year.`,
            "",
            "After the full review and selection process, your application was not selected for award.",
            "",
            "We appreciate your effort and interest in the scheme.",
            "",
            ...APPLICATION_MESSAGE_SIGNATURE
          ].join("\n")
        };
      default:
        return {
          subjectLine: `${schemeName}: Applicant Update`,
          bodyTemplate: "Dear {{applicantName}},\n\nThis is an update from the scholarship office."
        };
      }
  }

  async function sendTwilioMessage({ toPhone, bodyText, channel }) {
    const messagingChannel = normalizeMessagingChannel(channel);
    if (!["sms", "whatsapp"].includes(messagingChannel)) {
      throw new ValidationError("Only SMS and WhatsApp are supported by the phone messaging provider.");
    }
    if (config.messaging.smsProvider !== "twilio") {
      throw new ValidationError("The configured phone messaging provider is not supported yet.");
    }
    if (!config.messaging.twilioAccountSid || !config.messaging.twilioAuthToken) {
      throw new ValidationError("Twilio credentials are incomplete. Add them before sending phone messages.");
    }

    const fromNumber =
      messagingChannel === "whatsapp"
        ? config.messaging.twilioWhatsAppFromNumber
        : config.messaging.twilioFromNumber;
    if (!fromNumber) {
      throw new ValidationError(
        messagingChannel === "whatsapp"
          ? "TWILIO_WHATSAPP_FROM_NUMBER is not configured."
          : "TWILIO_FROM_NUMBER is not configured."
      );
    }

    const to = messagingChannel === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;
    const from = messagingChannel === "whatsapp" ? `whatsapp:${fromNumber}` : fromNumber;
    const authToken = Buffer.from(
      `${config.messaging.twilioAccountSid}:${config.messaging.twilioAuthToken}`,
      "utf8"
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.messaging.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authToken}`
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          Body: bodyText
        })
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ValidationError(
        payload.message || payload.code || "Twilio rejected the phone message send request."
      );
    }

    return {
      providerMessageId: payload.sid || null
    };
  }

  async function sendBrevoMessage({ toEmail, toName, subjectLine, bodyText }) {
    if (!config.messaging.enabled) {
      throw new ValidationError("Messaging is disabled in the current environment.");
    }
    if (config.messaging.provider !== "brevo") {
      throw new ValidationError("The configured messaging provider is not supported yet.");
    }
    if (!config.messaging.brevoApiKey) {
      throw new ValidationError("BREVO_API_KEY is not configured. Add it before sending emails.");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.messaging.brevoApiKey
      },
      body: JSON.stringify({
        sender: {
          email: APPLICATION_MESSAGE_SENDER,
          name: APPLICATION_MESSAGE_SENDER_NAME
        },
        to: [
          {
            email: toEmail,
            name: toName || undefined
          }
        ],
        subject: subjectLine,
        textContent: bodyText,
        htmlContent: renderEmailBodyAsHtml(bodyText)
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ValidationError(
        payload.message || payload.code || "Brevo rejected the email send request."
      );
    }

    return {
      providerMessageId: payload.messageId || null
    };
  }

  function renderMessageTemplate(template, application) {
    return String(template || "")
      .replaceAll("{{applicantName}}", application.studentName || "Applicant")
      .replaceAll("{{studentReferenceId}}", application.studentReferenceId || "N/A")
      .replaceAll("{{schemeName}}", application.schemeName || "Selected scheme")
      .replaceAll("{{academicYear}}", application.cycleLabel || "Selected academic year")
      .replaceAll("{{reviewReason}}", application.reviewReason || "Not recorded")
      .replaceAll("{{outcomeAmount}}", application.outcomeAmount ?? application.recommendedAmount ?? "N/A");
  }

  function summarizeMessageBatchItems(items = []) {
    return items.reduce(
      (summary, item) => {
        const status = String(item?.deliveryStatus || "logged").trim().toLowerCase();
        if (status === "sent") {
          summary.sentCount += 1;
        } else if (status === "failed") {
          summary.failedCount += 1;
        } else {
          summary.loggedCount += 1;
        }
        return summary;
      },
      {
        totalRecipients: items.length,
        sentCount: 0,
        failedCount: 0,
        loggedCount: 0
      }
    );
  }

  function normalizeBatchRetryMode(value) {
    return String(value || "pending_only").trim().toLowerCase() === "failed_only"
      ? "failed_only"
      : "pending_only";
  }

  async function assessImportPreview(payload) {
    await validateContext(payload);
    const criteria = await repositories.applicationCriteria.getBySchemeCycle(
      payload.schemeId,
      payload.cycleId
    );

    const preview = buildApplicationImportPreview(payload.rows || [], payload);
    const studentReferenceIds = preview.rows
      .map((row) => row.payload.studentReferenceId)
      .filter(Boolean);
    const studentLookup = await repositories.students.findExistingByIdentifierBatch({
      studentReferenceIds,
      indexNumbers: []
    });
    const matchedStudents = Array.from(studentLookup.byReferenceId.values())
      .flat()
      .reduce((map, item) => {
        if (!map.has(item.studentReferenceId)) {
          map.set(item.studentReferenceId, item);
        }
        return map;
      }, new Map());
    const existingApplications = await repositories.applications.findExistingForStudents(
      Array.from(new Set(Array.from(matchedStudents.values()).map((item) => item.id))),
      payload.schemeId,
      payload.cycleId
    );

    const rows = preview.rows.map((row) => {
      const issues = [...row.issues];
      const warnings = [];
      const matchedStudent = row.payload.studentReferenceId
        ? matchedStudents.get(row.payload.studentReferenceId) || null
        : null;

      if (!matchedStudent) {
        issues.push("No matching student was found in the registry for this reference ID.");
      }

      const existingApplication =
        matchedStudent ? existingApplications.get(matchedStudent.id) || null : null;
      if (existingApplication) {
        issues.push("This student already has an application for the selected scheme and academic year.");
      }

      const nameMismatchFlag = matchedStudent
        ? hasNameMismatch(row.payload.fullName, matchedStudent.fullName)
        : false;
      if (nameMismatchFlag) {
        warnings.push("Possible name mismatch between the uploaded row and the registry record.");
      }

      const screeningAssessment = buildApplicationScreeningAssessment({
        criteria,
        matchedStudent,
        payload: row.payload,
        nameMismatchFlag
      });

      return {
        ...row,
        status: issues.length ? "invalid" : "valid",
        issues,
        warnings,
        matchedStudent,
        existingApplication,
        nameMismatchFlag,
        screeningAssessment,
        resolvedStatus: applicationStatusFromMode(payload.importMode),
        resolvedRecommendationStatus: recommendationStatusFromMode(payload.importMode)
      };
    });

    return {
      summary: {
        totalRows: rows.length,
        validRows: rows.filter((row) => row.status === "valid").length,
        invalidRows: rows.filter((row) => row.status === "invalid").length,
        matchedRows: rows.filter((row) => row.matchedStudent).length,
        unmatchedRows: rows.filter((row) => !row.matchedStudent).length,
        nameMismatchRows: rows.filter((row) => row.nameMismatchFlag).length,
        screeningQualifiedRows: rows.filter(
          (row) => row.screeningAssessment?.recommendedDecision === "qualified"
        ).length,
        screeningPendingRows: rows.filter(
          (row) => row.screeningAssessment?.recommendedDecision === "pending"
        ).length,
        screeningDisqualifiedRows: rows.filter(
          (row) => row.screeningAssessment?.recommendedDecision === "disqualified"
        ).length
      },
      rows
    };
  }

  return {
    async list(filters) {
        const items = await repositories.applications.list({
          status: (filters.status || "").trim(),
          schemeId: (filters.schemeId || "").trim(),
          cycleId: (filters.cycleId || "").trim(),
          studentId: (filters.studentId || "").trim(),
          studentReferenceId: (filters.studentReferenceId || "").trim(),
          q: (filters.q || "").trim(),
          qualificationStatus: (filters.qualificationStatus || "").trim(),
          nameMismatchOnly: String(filters.nameMismatchOnly || "").trim()
        });
      return enrichApplications(items);
    },
    async summary(filters) {
      return repositories.applications.summary({
        schemeId: (filters.schemeId || "").trim(),
        cycleId: (filters.cycleId || "").trim(),
        studentReferenceId: (filters.studentReferenceId || "").trim(),
        q: (filters.q || "").trim()
      });
    },
    async cwaCoverage(filters) {
      return repositories.applications.cwaCoverage({
        schemeId: (filters.schemeId || "").trim(),
        cycleId: (filters.cycleId || "").trim(),
        studentReferenceId: (filters.studentReferenceId || "").trim(),
        q: (filters.q || "").trim(),
        qualificationStatus: (filters.qualificationStatus || "").trim(),
        nameMismatchOnly: String(filters.nameMismatchOnly || "").trim()
      });
    },
    async exportList(filters, actor) {
      const { scheme, cycle } = await validateContext(filters);
      const qualificationStatus = String(filters.qualificationStatus || "")
        .trim()
        .toLowerCase();

      if (
        !["qualified", "pending", "disqualified", "not_reviewed"].includes(qualificationStatus)
      ) {
        throw new ValidationError(
          "Export status must be qualified, pending, disqualified, or not_reviewed."
        );
      }

      const items = await repositories.applications.list({
        schemeId: String(filters.schemeId || "").trim(),
        cycleId: String(filters.cycleId || "").trim(),
        qualificationStatus
      });
      const enrichedItems = await enrichApplications(items);

      const buildApplicationsExportWorkbook = await loadApplicationsExportWorkbookFactory();

      return buildApplicationsExportWorkbook({
        items: enrichedItems,
        schemeName: scheme.name,
        academicYearLabel: cycle.academicYearLabel || cycle.label || "",
        qualificationStatus,
        fontName: normalizeExportFontName(filters.fontName),
        generatedBy: actor?.fullName || actor?.userId || "System"
      });
    },
    async messagingPreview(filters) {
      const messageType = normalizeMessageType(filters.messageType);
      if (!messageType) {
        throw new ValidationError("Choose a valid message type before generating the recipient preview.");
      }
      const channel = normalizeMessagingChannel(filters.channel);

      const { scheme, cycle } = await validateContext(filters);
      const scope = getMessageTypeScope(messageType);
      const items = await enrichApplications(
        await repositories.applications.list({
          schemeId: String(filters.schemeId || "").trim(),
          cycleId: String(filters.cycleId || "").trim(),
          qualificationStatus: scope.qualificationStatus || ""
        })
      );

      const filteredItems = items.filter((item) => {
        if (scope.outcomeDecision) {
          return item.outcomeDecision === scope.outcomeDecision;
        }
        return true;
      });

      const template = buildMessageTemplate(messageType, { scheme, cycle }, channel);
      const recipients = filteredItems.map((item) => ({
        applicationId: item.id,
        studentId: item.studentId,
        studentName: item.studentName || null,
        studentReferenceId: item.studentReferenceId || null,
        email: item.email || null,
        phone: item.phoneNumber || item.studentPhoneNumber || null,
        qualificationStatus: item.qualificationStatus || null,
        outcomeDecision: item.outcomeDecision || null,
        reviewReason: item.reviewReason || null,
        issue:
          channel === "email"
            ? item.email
              ? null
              : "Applicant email is missing from the application record and registry."
            : item.phoneNumber || item.studentPhoneNumber
              ? null
              : "Applicant phone number is missing from the application record and registry.",
        previewBody: renderMessageTemplate(template.bodyTemplate, item)
      }));

      const readyRecipients = recipients.filter((item) => !item.issue);
      const missingContactRecipients = recipients.filter((item) => item.issue);

      return {
        channel,
        senderEmail: APPLICATION_MESSAGE_SENDER,
        senderPhone: config.messaging.twilioFromNumber || "",
        senderWhatsApp: config.messaging.twilioWhatsAppFromNumber || "",
        messageType,
        subjectLine: template.subjectLine,
        bodyTemplate: template.bodyTemplate,
        summary: {
          totalRecipients: recipients.length,
          readyRecipients: readyRecipients.length,
          missingEmailRecipients: channel === "email" ? missingContactRecipients.length : 0,
          missingPhoneRecipients: channel === "email" ? 0 : missingContactRecipients.length
        },
        recipients: recipients.slice(0, PREVIEW_DISPLAY_LIMIT),
        returnedRecipients: Math.min(recipients.length, PREVIEW_DISPLAY_LIMIT),
        recipientsTruncated: recipients.length > PREVIEW_DISPLAY_LIMIT
      };
    },
    async getMessagingSettings() {
      return {
        senderEmail: APPLICATION_MESSAGE_SENDER,
        senderName: APPLICATION_MESSAGE_SENDER_NAME,
        provider: config.messaging.provider,
        sendingEnabled: Boolean(config.messaging.enabled && config.messaging.brevoApiKey),
        smsProvider: config.messaging.smsProvider,
        smsEnabled: Boolean(config.messaging.smsEnabled),
        senderPhone: config.messaging.twilioFromNumber || "",
        whatsAppEnabled: Boolean(config.messaging.whatsAppEnabled),
        senderWhatsApp: config.messaging.twilioWhatsAppFromNumber || ""
      };
    },
    async listImportIssues(filters) {
      if (!String(filters.schemeId || "").trim() || !String(filters.cycleId || "").trim()) {
        return {
          total: 0,
          items: []
        };
      }

      const items = await repositories.applications.listImportIssues({
        schemeId: String(filters.schemeId || "").trim(),
        cycleId: String(filters.cycleId || "").trim(),
        status: "open"
      });

      return {
        total: items.length,
        items
      };
    },
    async listMessageHistory(filters) {
      const items = await repositories.applications.listMessageBatches({
        schemeId: String(filters.schemeId || "").trim(),
        cycleId: String(filters.cycleId || "").trim()
      });

      return {
        total: items.length,
        items: items.map((item) => ({
          ...item,
          summary: summarizeMessageBatchItems(Array.isArray(item.items) ? item.items : [])
        }))
      };
    },
    async getApplicationHistory(id) {
      const application = await enrichApplication(await repositories.applications.getById(id));
      if (!application) {
        throw new NotFoundError("Application was not found.");
      }

      const events = [];

      pushHistoryEvent(events, {
        id: `application-created-${application.id}`,
        category: "application",
        title: "Application record created",
        description: `Application entered ${application.schemeName || "the selected scheme"} for ${
          application.cycleLabel || "the selected academic year"
        }.`,
        timestamp: application.submittedAt,
        actorName: null,
        tone: "success",
        meta: [
          application.studentReferenceId ? `Ref ID: ${application.studentReferenceId}` : null,
          application.status ? `Status: ${toDisplayLabel(application.status)}` : null
        ]
      });

      if (application.reviewUpdatedAt) {
        const title = application.reviewDecision ? "Review decision saved" : "Review data updated";
        const details = [];
        if (application.reviewDecision) {
          details.push(`Decision: ${toDisplayLabel(application.reviewDecision)}`);
        }
        if (application.reviewReason) {
          details.push(`Reason: ${toDisplayLabel(application.reviewReason)}`);
        }
        if (application.reviewComment) {
          details.push(`Notes: ${application.reviewComment}`);
        }
        if (application.interviewStatus) {
          details.push(`Interview: ${toDisplayLabel(application.interviewStatus)}`);
        }

        pushHistoryEvent(events, {
          id: `application-review-${application.id}`,
          category: "review",
          title,
          description:
            details.join(" | ") ||
            "Applicant details, review fields, or screening information were updated.",
          timestamp: application.reviewUpdatedAt,
          actorName: application.reviewedByName || null,
          tone:
            application.reviewDecision === "qualified"
              ? "success"
              : application.reviewDecision === "disqualified"
                ? "error"
                : "warning",
          meta: [
            application.qualificationStatus
              ? `Qualification: ${toDisplayLabel(application.qualificationStatus)}`
              : null,
            application.interviewScore !== null && application.interviewScore !== undefined
              ? `Interview score: ${application.interviewScore}`
              : null
          ]
        });
      }

      if (application.outcomeUpdatedAt && application.outcomeDecision) {
        pushHistoryEvent(events, {
          id: `application-outcome-${application.id}`,
          category: "outcome",
          title: "Outcome updated",
          description: `Application moved to ${toDisplayLabel(application.outcomeDecision)}.`,
          timestamp: application.outcomeUpdatedAt,
          actorName: application.outcomeUpdatedByName || null,
          tone:
            application.outcomeDecision === "awarded"
              ? "success"
              : application.outcomeDecision === "waitlisted"
                ? "warning"
                : "neutral",
          meta: [
            application.outcomeAmount !== null && application.outcomeAmount !== undefined
              ? `Amount: ${application.outcomeAmount}`
              : null,
            application.outcomeNotes ? `Notes: ${application.outcomeNotes}` : null
          ]
        });
      }

      const academicHistory = await repositories.students.listAcademicHistory({
        studentId: application.studentId
      });
      academicHistory
        .filter((item) => item.updatedAt || item.createdAt)
        .slice(0, 10)
        .forEach((item) => {
          pushHistoryEvent(events, {
            id: `academic-history-${item.id}`,
            category: "academic",
            title: "Academic standing saved",
            description: "Academic history was updated from the applications workflow.",
            timestamp: item.updatedAt || item.createdAt,
            actorName: null,
            tone: "neutral",
            meta: [
              item.academicYearLabel ? `Academic year: ${item.academicYearLabel}` : null,
              item.semesterLabel ? `Semester: ${item.semesterLabel}` : null,
              item.cwa !== null && item.cwa !== undefined ? `CWA: ${item.cwa}` : null,
              item.wassceAggregate !== null && item.wassceAggregate !== undefined
                ? `WASSCE Aggregate: ${item.wassceAggregate}`
                : null
            ]
          });
        });

      const messageBatches = await repositories.applications.listMessageBatches({
        schemeId: application.schemeId,
        cycleId: application.cycleId
      });
      messageBatches.forEach((batch) => {
        const matchingItems = (batch.items || []).filter(
          (item) => String(item.applicationId || "") === String(application.id)
        );
        if (!matchingItems.length) {
          return;
        }

        matchingItems.forEach((item) => {
          pushHistoryEvent(events, {
            id: `message-logged-${batch.id}-${item.id}`,
            category: "messaging",
            title: "Message batch logged",
            description: `${toDisplayLabel(batch.messageType)} prepared for this applicant.`,
            timestamp: item.createdAt || batch.createdAt,
            actorName: batch.createdByName || null,
            tone: "neutral",
            meta: [
              item.recipientEmail
                ? `Recipient: ${item.recipientEmail}`
                : item.recipientPhone
                  ? `Recipient: ${item.recipientPhone}`
                  : null,
              batch.senderEmail ? `Sender: ${batch.senderEmail}` : null
            ]
          });

          if (item.updatedAt && item.deliveryStatus && item.deliveryStatus !== "logged") {
            pushHistoryEvent(events, {
              id: `message-status-${batch.id}-${item.id}`,
              category: "messaging",
              title:
                item.deliveryStatus === "sent"
                  ? "Message sent"
                  : item.deliveryStatus === "failed"
                    ? "Message delivery failed"
                    : "Message batch updated",
              description:
                item.deliveryStatus === "sent"
                  ? `${toDisplayLabel(batch.messageType)} was sent to the applicant.`
                  : item.errorMessage || "Message delivery state changed.",
              timestamp: item.updatedAt,
              actorName: batch.createdByName || null,
              tone: item.deliveryStatus === "sent" ? "success" : "error",
              meta: [
                item.recipientEmail
                  ? `Recipient: ${item.recipientEmail}`
                  : item.recipientPhone
                    ? `Recipient: ${item.recipientPhone}`
                    : null,
                item.providerMessageId ? `Provider ID: ${item.providerMessageId}` : null
              ]
            });
          }
        });
      });

      events.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

      return {
        application,
        total: events.length,
        events
      };
    },
    async resolveImportIssue(issueId, payload, actor) {
      const item = await repositories.applications.resolveImportIssue(issueId, {
        resolutionNotes: normalizeStringOrNull(payload.resolutionNotes),
        linkedApplicationId: normalizeStringOrNull(payload.linkedApplicationId),
        resolvedByUserId: actor?.userId || null,
        resolvedByName: actor?.fullName || null
      });

      if (!item) {
        throw new NotFoundError("Application import issue was not found.");
      }

      return {
        item
      };
    },
    async recordMessageBatch(payload, actor) {
      const preview = await this.messagingPreview(payload);
      const recipientEdits = normalizeRecipientEdits(payload.recipientEdits);
      const subjectLine =
        preview.channel === "email"
          ? normalizeMessageDraftValue(payload.subjectLine, preview.subjectLine, "subjectLine")
          : "";
      const bodyTemplate = normalizeMessageDraftValue(
        payload.bodyTemplate,
        preview.bodyTemplate,
        "bodyTemplate"
      );
      const recipients = (preview.recipients || []).map((item) => {
        const edit = recipientEdits[String(item.applicationId || "")] || null;
        const email = edit?.email ?? item.email ?? null;
        const phone = edit?.phone ?? item.phone ?? null;

        return {
          ...item,
          email,
          phone,
          issue:
            preview.channel === "email"
              ? email
                ? null
                : "Applicant email is missing from the application record and registry."
              : phone
                ? null
                : "Applicant phone number is missing from the application record and registry."
        };
      });
      const readyRecipients = recipients.filter((item) => !item.issue);
      if (!readyRecipients.length) {
        throw new ValidationError(
          "No recipients are ready for this messaging batch. Check the recipient preview first."
        );
      }

      const senderValue =
        preview.channel === "sms"
          ? config.messaging.twilioFromNumber || ""
          : preview.channel === "whatsapp"
            ? config.messaging.twilioWhatsAppFromNumber || ""
            : APPLICATION_MESSAGE_SENDER;

      const batch = await repositories.applications.createMessageBatch({
        schemeId: String(payload.schemeId || "").trim(),
        cycleId: String(payload.cycleId || "").trim(),
        channel: preview.channel,
        messageType: preview.messageType,
        senderEmail: senderValue,
        subjectLine,
        bodyTemplate,
        status: "logged",
        createdByUserId: actor?.userId || null,
        createdByName: actor?.fullName || null,
        items: readyRecipients.map((item) => ({
          applicationId: item.applicationId,
          studentId: item.studentId,
          recipientEmail: item.email,
          recipientPhone: item.phone,
          recipientName: item.studentName,
          deliveryStatus: "logged",
          errorMessage: null
        }))
      });

      return {
        channel: preview.channel,
        senderEmail: APPLICATION_MESSAGE_SENDER,
        senderPhone: config.messaging.twilioFromNumber || "",
        senderWhatsApp: config.messaging.twilioWhatsAppFromNumber || "",
        batch
      };
    },
    async sendMessageBatch(payload, actor) {
      assertRequiredString(payload.batchId, "batchId", "Messaging batch");
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can send messaging batches.");
      }

      const batches = await repositories.applications.listMessageBatches({});
      const batch = batches.find((item) => String(item.id) === String(payload.batchId));
      if (!batch) {
        throw new NotFoundError("Messaging batch was not found.");
      }

      const items = Array.isArray(batch.items) ? batch.items : [];
      if (!items.length) {
        throw new ValidationError("This messaging batch has no recipients to send.");
      }

      const retryMode = normalizeBatchRetryMode(payload.retryMode);
      const itemsToSend =
        retryMode === "failed_only"
          ? items.filter((item) => String(item.deliveryStatus || "").toLowerCase() === "failed")
          : items.filter((item) => String(item.deliveryStatus || "").toLowerCase() !== "sent");

      if (!itemsToSend.length) {
        throw new ValidationError(
          retryMode === "failed_only"
            ? "There are no failed recipients left to resend for this batch."
            : "All recipients in this batch have already been sent successfully."
        );
      }

      const updates = [];
      let sentCount = 0;
      let failedCount = 0;
      let loggedCount = 0;
      const channel = normalizeMessagingChannel(batch.channel || "email");
      const sendingEnabled =
        channel === "email"
          ? Boolean(config.messaging.enabled && config.messaging.brevoApiKey)
          : channel === "sms"
            ? Boolean(
                config.messaging.smsEnabled &&
                config.messaging.smsProvider === "twilio" &&
                config.messaging.twilioAccountSid &&
                config.messaging.twilioAuthToken &&
                config.messaging.twilioFromNumber
              )
            : Boolean(
                config.messaging.whatsAppEnabled &&
                config.messaging.smsProvider === "twilio" &&
                config.messaging.twilioAccountSid &&
                config.messaging.twilioAuthToken &&
                config.messaging.twilioWhatsAppFromNumber
              );

      for (const item of itemsToSend) {
        if (channel === "email" && !item.recipientEmail) {
          updates.push({
            id: item.id,
            deliveryStatus: "failed",
            errorMessage: "Recipient email is missing.",
            providerMessageId: null
          });
          failedCount += 1;
          continue;
        }
        if ((channel === "sms" || channel === "whatsapp") && !item.recipientPhone) {
          updates.push({
            id: item.id,
            deliveryStatus: "failed",
            errorMessage: "Recipient phone number is missing.",
            providerMessageId: null
          });
          failedCount += 1;
          continue;
        }
        if (!sendingEnabled) {
          updates.push({
            id: item.id,
            deliveryStatus: "logged",
            errorMessage: null,
            providerMessageId: null
          });
          loggedCount += 1;
          continue;
        }

        try {
          const bodyText = String(batch.bodyTemplate || "").replaceAll(
            "{{applicantName}}",
            item.recipientName || "Applicant"
          );
          const delivery =
            channel === "email"
              ? await sendBrevoMessage({
                  toEmail: item.recipientEmail,
                  toName: item.recipientName,
                  subjectLine: batch.subjectLine,
                  bodyText
                })
              : await sendTwilioMessage({
                  toPhone: item.recipientPhone,
                  bodyText,
                  channel
                });
          updates.push({
            id: item.id,
            deliveryStatus: "sent",
            errorMessage: null,
            providerMessageId: delivery.providerMessageId || null
          });
          sentCount += 1;
        } catch (error) {
          updates.push({
            id: item.id,
            deliveryStatus: "failed",
            errorMessage: error.message,
            providerMessageId: null
          });
          failedCount += 1;
        }
      }

      const updateMap = new Map(updates.map((item) => [String(item.id), item]));
      const nextItems = items.map((item) => {
        const update = updateMap.get(String(item.id));
        return update
          ? {
              ...item,
              deliveryStatus: update.deliveryStatus,
              errorMessage: update.errorMessage,
              providerMessageId: update.providerMessageId || null
            }
          : item;
      });
      const totals = summarizeMessageBatchItems(nextItems);
      const status =
        totals.failedCount > 0 && totals.sentCount > 0
          ? "partial"
          : totals.failedCount > 0
            ? "failed"
            : totals.loggedCount > 0
              ? "logged"
              : "sent";
      const updatedBatch = await repositories.applications.updateMessageBatchDelivery(batch.id, {
        status,
        items: updates
      });

      return {
        channel,
        batch: updatedBatch
          ? {
              ...updatedBatch,
              summary: summarizeMessageBatchItems(Array.isArray(updatedBatch.items) ? updatedBatch.items : [])
            }
          : null,
        summary: {
          sentCount,
          failedCount,
          loggedCount,
          attemptedCount: itemsToSend.length,
          retryMode,
          ...totals
        }
      };
    },
    async create(payload, actor) {
      assertRequiredString(payload.studentId, "studentId", "Student ID");
      await validateContext(payload);

      const student = await repositories.students.getById(payload.studentId);
      if (!student) {
        throw new NotFoundError("The selected student does not exist.");
      }

      const existing = await repositories.applications.findExisting(
        payload.studentId,
        payload.schemeId,
        payload.cycleId
      );

      if (existing) {
        throw new ConflictError(
          "This student already has an application for the scheme in the selected academic year.",
          { application: existing }
        );
      }

      const uploadedFullName =
        normalizeStringOrNull(payload.uploadedFullName) ||
        normalizeStringOrNull(payload.fullName) ||
        student.fullName;
      const uploadedStudentReferenceId =
        normalizeStringOrNull(payload.uploadedStudentReferenceId) ||
        normalizeStringOrNull(payload.studentReferenceId) ||
        student.studentReferenceId ||
        null;
      const applicantEmail =
        normalizeStringOrNull(payload.applicantEmail) ||
        normalizeStringOrNull(payload.email) ||
        student.email ||
        null;
      const uploadedProgram =
        normalizeStringOrNull(payload.uploadedProgram) ||
        normalizeStringOrNull(payload.program) ||
        null;

      const created = await repositories.applications.create(
        {
          id: createId("application"),
          studentId: payload.studentId.trim(),
          schemeId: payload.schemeId.trim(),
          cycleId: payload.cycleId.trim(),
          cycle: payload.cycle || null,
          status: payload.status?.trim() || "submitted",
          eligibilityStatus: payload.eligibilityStatus?.trim() || "pending",
          needCategory: payload.needCategory?.trim() || null,
          needScore: normalizeNumber(payload.needScore),
          finalScore: normalizeNumber(payload.finalScore),
          recommendationStatus: payload.recommendationStatus?.trim() || null,
          recommendedAmount: normalizeNumber(payload.recommendedAmount),
          reviewerMetadata: {
            noteText: normalizeStringOrNull(payload.reviewerNotes),
            uploadedFullName,
            uploadedStudentReferenceId,
            applicantEmail,
            uploadedProgram,
            documentChecklist: normalizeDocumentChecklist(payload.documentChecklist),
            nameMismatchFlag: hasApplicantMismatch(
              uploadedFullName,
              student.fullName,
              uploadedStudentReferenceId,
              student.studentReferenceId
            ),
            interviewStatus: normalizeInterviewStatus(payload.interviewStatus),
            interviewScore: normalizeNumber(payload.interviewScore),
            interviewDate: normalizeStringOrNull(payload.interviewDate),
            interviewNotes: normalizeStringOrNull(payload.interviewNotes),
            reviewDecision: normalizeStringOrNull(payload.reviewDecision),
            reviewReason: normalizeStringOrNull(payload.reviewReason),
            reviewComment: normalizeStringOrNull(payload.reviewComment),
            reviewUpdatedAt: payload.reviewDecision ? new Date().toISOString() : null,
            reviewedByUserId: payload.reviewDecision ? actor?.userId || null : null,
            reviewedByName: payload.reviewDecision
              ? actor?.fullName || actor?.email || actor?.userId || null
              : null
          },
          submittedAt: new Date().toISOString(),
          createdBy: actor?.userId || null
        },
        actor
      );
      return enrichApplication(created);
    },
    async previewImport(payload) {
      const preview = await assessImportPreview(payload);
      await repositories.applications.replaceImportIssues({
        schemeId: String(payload.schemeId || "").trim(),
        cycleId: String(payload.cycleId || "").trim(),
        sourceType: "application_import",
        items: preview.rows
          .filter((row) => row.status === "invalid")
          .map((row) => ({
            rowNumber: row.rowNumber,
            studentReferenceId: row.payload?.studentReferenceId || null,
            fullName: row.payload?.fullName || null,
            payload: row.payload || {},
            issues: row.issues || []
          }))
      });
      return buildPreviewResponse(preview);
    },
    async importRows(payload, actor) {
      const preview = await assessImportPreview(payload);
      const importedRows = [];
      const rejectedRows = [];

      for (const row of preview.rows) {
        if (row.status !== "valid") {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            studentReferenceId: row.payload.studentReferenceId,
            fullName: row.payload.fullName,
            payload: row.payload,
            issues: row.issues
          });
          continue;
        }

        try {
          const item = await repositories.applications.create(
            {
              id: createId("application"),
              studentId: row.matchedStudent.id,
              schemeId: payload.schemeId.trim(),
              cycleId: payload.cycleId.trim(),
              cycle: null,
              status: applicationStatusFromMode(payload.importMode),
              eligibilityStatus: "pending",
              needCategory: null,
              needScore: null,
              finalScore: row.payload.finalScore,
              recommendationStatus: recommendationStatusFromMode(payload.importMode),
              recommendedAmount: row.payload.recommendedAmount,
              reviewerMetadata: {
                noteText: row.payload.reviewerNotes || row.payload.notes || null,
                uploadedFullName: row.payload.fullName || null,
                uploadedStudentReferenceId: row.payload.studentReferenceId || null,
                applicantEmail: row.payload.applicantEmail || null,
                uploadedProgram: row.payload.program || null,
                documentChecklist: normalizeDocumentChecklist(row.payload.documentChecklist),
                nameMismatchFlag: row.nameMismatchFlag,
                interviewStatus: null,
                interviewScore: null,
                interviewDate: null,
                interviewNotes: null,
                reviewDecision: null,
                reviewReason: null,
                reviewComment: null,
                reviewUpdatedAt: null
              },
              submittedAt: new Date().toISOString(),
              createdBy: actor?.userId || null
            },
            actor
          );
          if (row.payload.phoneNumber && !row.matchedStudent.phoneNumber) {
            try {
              await repositories.students.updateContact(row.matchedStudent.id, {
                phoneNumber: row.payload.phoneNumber
              });
            } catch {
              // Best-effort contact enrichment should not block the application import.
            }
          }
          importedRows.push({
            rowNumber: row.rowNumber,
            item: await enrichApplication(item)
          });
        } catch (error) {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            studentReferenceId: row.payload.studentReferenceId,
            fullName: row.payload.fullName,
            payload: row.payload,
            issues: [error.message]
          });
        }
      }

      await repositories.applications.replaceImportIssues({
        schemeId: String(payload.schemeId || "").trim(),
        cycleId: String(payload.cycleId || "").trim(),
        sourceType: "application_import",
        items: rejectedRows.map((row) => ({
          rowNumber: row.rowNumber,
          studentReferenceId: row.studentReferenceId || row.payload?.studentReferenceId || null,
          fullName: row.fullName || row.payload?.fullName || null,
          payload: row.payload || {},
          issues: row.issues || []
        }))
      });

      return {
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: importedRows.length,
          rejectedRows: rejectedRows.length
        },
        importedRows: importedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRows: rejectedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsReturned: Math.min(importedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRowsReturned: Math.min(rejectedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsTruncated: importedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        rejectedRowsTruncated: rejectedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        preview: buildPreviewResponse(preview)
      };
    },
    async previewInterviewImport(payload) {
      const preview = await assessInterviewImportPreview(payload, repositories, validateContext);
      return buildPreviewResponse(preview);
    },
    async importInterviewRows(payload, actor) {
      const preview = await assessInterviewImportPreview(payload, repositories, validateContext);
      const importedRows = [];
      const rejectedRows = [];

      for (const row of preview.rows) {
        if (row.status !== "valid" || !row.matchedApplication) {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            studentReferenceId: row.payload.studentReferenceId,
            indexNumber: row.payload.indexNumber,
            fullName: row.payload.fullName,
            issues: row.issues
          });
          continue;
        }

        try {
          const existing = row.matchedApplication;
          const interviewStatus =
            normalizeInterviewStatus(row.payload.interviewStatus) ||
            (row.payload.interviewScore !== null ? "completed" : existing.interviewStatus || null);

          const updated = await repositories.applications.updateReview(
            existing.id,
            {
              status: existing.status,
              eligibilityStatus: existing.eligibilityStatus,
              reviewerMetadata: {
                noteText: existing.reviewerNotes || null,
                uploadedFullName: existing.uploadedFullName || existing.studentName || null,
                uploadedStudentReferenceId:
                  existing.uploadedStudentReferenceId || existing.studentReferenceId || null,
                applicantEmail: existing.applicantEmail || existing.email || null,
                uploadedProgram: existing.uploadedProgram || existing.program || null,
                documentChecklist: normalizeDocumentChecklist(existing.documentChecklist),
                nameMismatchFlag: Boolean(existing.nameMismatchFlag),
                interviewStatus,
                interviewScore:
                  row.payload.interviewScore === null
                    ? existing.interviewScore ?? null
                    : row.payload.interviewScore,
                interviewDate: normalizeStringOrNull(row.payload.interviewDate) || existing.interviewDate || null,
                interviewNotes:
                  normalizeStringOrNull(row.payload.interviewNotes) || existing.interviewNotes || null,
                reviewDecision: existing.reviewDecision || null,
                reviewReason: existing.reviewReason || null,
                reviewComment: existing.reviewComment || null,
                outcomeDecision: existing.outcomeDecision || null,
                outcomeAmount: existing.outcomeAmount ?? null,
                outcomeNotes: existing.outcomeNotes || null,
                outcomeUpdatedAt: existing.outcomeUpdatedAt || null,
                outcomeUpdatedByUserId: existing.outcomeUpdatedByUserId || null,
                outcomeUpdatedByName: existing.outcomeUpdatedByName || null,
                reviewUpdatedAt: new Date().toISOString(),
                reviewedByUserId: actor?.userId || null,
                reviewedByName: actor?.fullName || null
              }
            },
            actor
          );

          importedRows.push({
            rowNumber: row.rowNumber,
            item: await enrichApplication(updated)
          });
        } catch (error) {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            studentReferenceId: row.payload.studentReferenceId,
            indexNumber: row.payload.indexNumber,
            fullName: row.payload.fullName,
            issues: [error.message]
          });
        }
      }

      return {
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: importedRows.length,
          rejectedRows: rejectedRows.length,
          matchedRows: preview.summary.matchedRows,
          unmatchedRows: preview.summary.unmatchedRows
        },
        importedRows: importedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRows: rejectedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsReturned: Math.min(importedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRowsReturned: Math.min(rejectedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsTruncated: importedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        rejectedRowsTruncated: rejectedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        preview: buildPreviewResponse(preview)
      };
    },
    async bulkUpdateInterview(payload, actor) {
      await validateContext(payload);

      const interviewStatus = normalizeInterviewStatus(payload.interviewStatus);
      if (!interviewStatus) {
        throw new ValidationError(
          "Choose an interview status before applying the update to the active application list."
        );
      }

      const interviewDate = normalizeStringOrNull(payload.interviewDate);
      const interviewNotes = normalizeStringOrNull(payload.interviewNotes);

      const result = await repositories.applications.bulkUpdateInterview(
        {
          schemeId: String(payload.schemeId || "").trim(),
          cycleId: String(payload.cycleId || "").trim(),
          interviewStatus,
          interviewDate,
          interviewNotes,
          reviewedByUserId: actor?.userId || null,
          reviewedByName: actor?.fullName || null
        },
        actor
      );

      return {
        summary: {
          updatedApplications: result.updatedApplications || 0
        },
        updatedApplications: result.updatedApplications || 0
      };
    },
    async bulkApplyOutcomes(payload, actor) {
      await validateContext(payload);

      const sourceQualificationStatus = String(payload.sourceQualificationStatus || "")
        .trim()
        .toLowerCase();
      if (!["qualified", "pending", "disqualified", "not_reviewed"].includes(sourceQualificationStatus)) {
        throw new ValidationError(
          "Choose the source review group before applying an outcome to the active application list."
        );
      }

      const outcomeDecision = normalizeOutcomeDecision(payload.outcomeDecision);
      if (!outcomeDecision) {
        throw new ValidationError(
          "Choose whether the selected group should become awarded or not selected."
        );
      }

      const outcomeAmount =
        payload.outcomeAmount === undefined || payload.outcomeAmount === null || payload.outcomeAmount === ""
          ? null
          : normalizeNumber(payload.outcomeAmount);

      if (outcomeAmount !== null && outcomeAmount < 0) {
        throw new ValidationError("Outcome amount cannot be negative.");
      }

      const outcomeNotes = normalizeStringOrNull(payload.outcomeNotes);

      const result = await repositories.applications.bulkUpdateOutcomes(
        {
          schemeId: String(payload.schemeId || "").trim(),
          cycleId: String(payload.cycleId || "").trim(),
          sourceQualificationStatus,
          outcomeDecision,
          outcomeAmount,
          outcomeNotes,
          outcomeUpdatedByUserId: actor?.userId || null,
          outcomeUpdatedByName: actor?.fullName || null
        },
        actor
      );

      return {
        summary: {
          updatedApplications: result.updatedApplications || 0,
          sourceQualificationStatus,
          outcomeDecision
        },
        updatedApplications: result.updatedApplications || 0,
        sourceQualificationStatus,
        outcomeDecision
      };
    },
    async saveAcademicHistoryEntry(id, payload, actor) {
      const existing = await repositories.applications.getById(id);
      if (!existing) {
        throw new NotFoundError("Application was not found.");
      }

      const cwaProvided = payload.cwa !== undefined && payload.cwa !== null && payload.cwa !== "";
      const wassceProvided =
        payload.wassceAggregate !== undefined &&
        payload.wassceAggregate !== null &&
        payload.wassceAggregate !== "";

      if (!cwaProvided && !wassceProvided) {
        throw new ValidationError(
          "Enter a CWA or WASSCE Aggregate value before saving to academic history."
        );
      }

      const item = await repositories.students.upsertAcademicHistoryEntry({
        studentId: existing.studentId,
        cycleId: existing.cycleId || null,
        college: existing.college || null,
        program: existing.program || existing.uploadedProgram || null,
        year: existing.year || null,
        academicYearLabel:
          normalizeAcademicYearLabel(payload.academicYearLabel) ||
          normalizeAcademicYearLabel(existing.cwaAcademicYearLabel) ||
          normalizeAcademicYearLabel(existing.cycleLabel),
        semesterLabel:
          normalizeStringOrNull(payload.semesterLabel) ||
          (cwaProvided ? "Manual review entry" : "Manual registry update"),
        cwa: cwaProvided ? normalizeNumber(payload.cwa) : null,
        wassceAggregate: wassceProvided ? normalizeNumber(payload.wassceAggregate) : null
      });

      return {
        item,
        application: await enrichApplication(await repositories.applications.getById(id))
      };
    },
    async review(id, payload, actor) {
      const existing = await repositories.applications.getById(id);
      if (!existing) {
        throw new NotFoundError("Application was not found.");
      }

      const reviewDecision = String(payload.reviewDecision || "").trim().toLowerCase();
      const hasReviewDecision = Boolean(reviewDecision);
      if (hasReviewDecision && !["qualified", "disqualified", "pending"].includes(reviewDecision)) {
        throw new ValidationError("Review decision must be qualified, disqualified, or pending.");
      }

      const reviewReason = normalizeStringOrNull(payload.reviewReason);
      if (["disqualified", "pending"].includes(reviewDecision) && !reviewReason) {
        throw new ValidationError("A review reason is required for disqualified or pending decisions.");
      }

      const useRegistryData = Boolean(payload.useRegistryData);
      const uploadedFullName = useRegistryData
        ? existing.studentName || null
        : normalizeStringOrNull(payload.uploadedFullName) ||
          existing.uploadedFullName ||
          existing.studentName ||
          null;
      const uploadedStudentReferenceId = useRegistryData
        ? existing.studentReferenceId || null
        : normalizeStringOrNull(payload.uploadedStudentReferenceId) ||
          existing.uploadedStudentReferenceId ||
          existing.studentReferenceId ||
          null;
      const applicantEmail =
        normalizeStringOrNull(payload.applicantEmail) ||
        normalizeStringOrNull(payload.email) ||
        existing.applicantEmail ||
        existing.email ||
        null;
      const interviewStatus =
        normalizeInterviewStatus(payload.interviewStatus) || existing.interviewStatus || null;
      const interviewScore =
        payload.interviewScore === undefined
          ? existing.interviewScore ?? null
          : normalizeNumber(payload.interviewScore);
      const interviewDate =
        normalizeStringOrNull(payload.interviewDate) || existing.interviewDate || null;
      const interviewNotes =
        normalizeStringOrNull(payload.interviewNotes) || existing.interviewNotes || null;
      const reviewComment = normalizeStringOrNull(payload.reviewComment);
      const documentChecklist = normalizeDocumentChecklist(payload.documentChecklist);
      const nextReviewDecision = hasReviewDecision
        ? reviewDecision
        : existing.reviewDecision || null;
      const nextReviewReason =
        reviewReason || (hasReviewDecision ? null : existing.reviewReason || null);

      if (
        !hasReviewDecision &&
        !payload.useRegistryData &&
        uploadedFullName === (existing.uploadedFullName || existing.studentName || null) &&
        uploadedStudentReferenceId ===
          (existing.uploadedStudentReferenceId || existing.studentReferenceId || null) &&
        applicantEmail === (existing.applicantEmail || existing.email || null) &&
        interviewStatus === (existing.interviewStatus || null) &&
        interviewScore === (existing.interviewScore ?? null) &&
        interviewDate === (existing.interviewDate || null) &&
        interviewNotes === (existing.interviewNotes || null) &&
        reviewComment === (existing.reviewComment || null)
      ) {
        throw new ValidationError(
          "Update the applicant details, interview details, or choose a reviewer decision before saving."
        );
      }

      const updated = await repositories.applications.updateReview(
        id,
        {
          status: hasReviewDecision
            ? toApplicationStatus(reviewDecision, existing.status)
            : existing.status,
          eligibilityStatus: hasReviewDecision
            ? toEligibilityStatus(reviewDecision)
            : existing.eligibilityStatus,
          reviewerMetadata: {
            noteText: existing.reviewerNotes || null,
            uploadedFullName,
            uploadedStudentReferenceId,
            applicantEmail,
            uploadedProgram: existing.uploadedProgram || existing.program || null,
            documentChecklist,
            nameMismatchFlag: hasApplicantMismatch(
              uploadedFullName,
              existing.studentName,
              uploadedStudentReferenceId,
              existing.studentReferenceId
            ),
            interviewStatus,
            interviewScore,
            interviewDate,
            interviewNotes,
            reviewDecision: nextReviewDecision,
            reviewReason: nextReviewReason,
            reviewComment,
            outcomeDecision: existing.outcomeDecision || null,
            outcomeAmount: existing.outcomeAmount ?? null,
            outcomeNotes: existing.outcomeNotes || null,
            outcomeUpdatedAt: existing.outcomeUpdatedAt || null,
            outcomeUpdatedByUserId: existing.outcomeUpdatedByUserId || null,
            outcomeUpdatedByName: existing.outcomeUpdatedByName || null,
            reviewUpdatedAt: new Date().toISOString(),
            reviewedByUserId: actor?.userId || null,
            reviewedByName: actor?.fullName || null
          }
        },
        actor
      );

      if (!updated) {
        throw new NotFoundError("Application was not found.");
      }

      return enrichApplication(updated);
    }
  };
}
