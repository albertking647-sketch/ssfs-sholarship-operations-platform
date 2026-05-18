import { config } from "../../config.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { buildBeneficiaryImportPreview } from "./import.js";

const VALID_IMPORT_MODES = new Set(["current_cycle_linked", "historical_archive"]);
const VALID_DUPLICATE_STRATEGIES = new Set(["skip", "import_anyway", "replace_existing"]);
const VALID_DUPLICATE_VIEWS = new Set(["unresolved", "resolved"]);
const VALID_DECLINATION_CHANNELS = new Set(["email", "sms"]);
const DUPLICATE_RESOLVED_STATUSES = new Set(["allowed_on_both", "declined_one_scheme"]);
const DECLINATION_MESSAGE_SIGNATURE = [
  "Best regards,",
  "Student Support and Financial Services, DoSA",
  "KNUST"
];

function emitImportProgress(progress, event = {}) {
  if (typeof progress !== "function") {
    return;
  }
  const processedRows = Math.max(0, Number(event.processedRows || 0));
  const totalRows = Math.max(0, Number(event.totalRows || 0));
  progress({
    phase: event.phase || "importing",
    processedRows,
    totalRows,
    percent:
      event.percent !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(event.percent || 0))))
        : totalRows > 0
          ? Math.max(0, Math.min(100, Math.round((processedRows / totalRows) * 100)))
          : 0,
    message: event.message || "Importing beneficiary rows..."
  });
}

function normalizeImportMode(value) {
  const mode = String(value || "").trim().toLowerCase() || "historical_archive";
  if (!VALID_IMPORT_MODES.has(mode)) {
    throw new ValidationError("Choose a valid beneficiary import mode.");
  }
  return mode;
}

function normalizeDuplicateStrategy(value, allowDuplicates = false) {
  const fallback = allowDuplicates ? "import_anyway" : "skip";
  const strategy = String(value || "").trim().toLowerCase() || fallback;
  if (!VALID_DUPLICATE_STRATEGIES.has(strategy)) {
    throw new ValidationError("Choose a valid duplicate action.");
  }
  return strategy;
}

function buildBeneficiaryDuplicateKey(payload = {}) {
  if (!payload.academicYearLabel || !payload.schemeName || !payload.studentReferenceId) {
    return "";
  }

  return [
    String(payload.academicYearLabel || "").trim().toLowerCase(),
    String(payload.schemeName || "").trim().toLowerCase(),
    String(payload.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildDuplicateKeySet(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const key = buildBeneficiaryDuplicateKey(row.payload || row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function buildCrossScopeStudentIdSet(rows = []) {
  const scopes = new Map();

  for (const row of rows || []) {
    const payload = row.payload || row;
    const studentReferenceId = normalizeLookupValue(payload.studentReferenceId);
    const duplicateKey = buildBeneficiaryDuplicateKey(payload);
    if (!studentReferenceId || !duplicateKey) continue;
    if (!scopes.has(studentReferenceId)) {
      scopes.set(studentReferenceId, new Set());
    }
    scopes.get(studentReferenceId).add(duplicateKey);
  }

  return new Set(
    [...scopes.entries()]
      .filter(([, keys]) => keys.size > 1)
      .map(([studentReferenceId]) => studentReferenceId)
  );
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\b\d{4}\/\d{4}\b/);
  const normalized = match ? match[0] : text;
  return /^\d{4}\/\d{4}$/.test(normalized) ? `${normalized} Academic Year` : normalized;
}

function normalizeSchemeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getAcademicYearStart(value) {
  const match = normalizeAcademicYearLabel(value).match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "internal" || text === "external") return text;
  return "unknown";
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase() || "GHS";
}

function normalizeBeneficiaryCohort(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "not applicable" || text === "not_applicable" || text === "none") {
    return null;
  }
  if (text.includes("current")) return "current";
  if (text.includes("new")) return "new";
  if (text === "single_cycle" || text.includes("single cycle")) return "single_cycle";
  return null;
}

function normalizeDuplicateView(value) {
  const view = String(value || "").trim().toLowerCase() || "unresolved";
  return VALID_DUPLICATE_VIEWS.has(view) ? view : "unresolved";
}

function normalizeDeclinationChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (!VALID_DECLINATION_CHANNELS.has(channel)) {
    throw new ValidationError("Choose email or SMS before sending declination requests.");
  }
  return channel;
}

function normalizeGroupKeyPart(value) {
  return String(value || "").trim().toLowerCase();
}

function buildDuplicateGroupKey(academicYearLabel, studentReferenceId) {
  return [
    normalizeGroupKeyPart(normalizeAcademicYearLabel(academicYearLabel)),
    normalizeGroupKeyPart(studentReferenceId)
  ].join("||");
}

function buildDuplicateSchemeSignature(schemes = []) {
  return [...new Set(
    (schemes || [])
      .map((item) => normalizeSchemeName(item.schemeName || item))
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  )]
    .sort((left, right) => left.localeCompare(right))
    .join("||");
}

function normalizeActorName(actor) {
  return (
    String(actor?.fullName || "").trim() ||
    String(actor?.email || "").trim() ||
    String(actor?.userId || "").trim() ||
    "System"
  );
}

function applyDuplicateGroupFilters(group, filters = {}) {
  const academicYearLabel = normalizeAcademicYearLabel(filters.academicYearLabel);
  const schemeName = normalizeSchemeName(filters.schemeName).toLowerCase();
  if (academicYearLabel && group.academicYearLabel !== academicYearLabel) {
    return false;
  }
  if (
    schemeName &&
    !group.schemes.some((item) => normalizeSchemeName(item.schemeName).toLowerCase() === schemeName)
  ) {
    return false;
  }
  return true;
}

function buildDeclinationMessage(group) {
  const schemeNames = (group.schemes || []).map((item) => item.schemeName).filter(Boolean);
  return [
    `Dear ${group.fullName || "Student"},`,
    "",
    `Our records show that you are currently listed under more than one support or scholarship scheme for ${group.academicYearLabel}.`,
    "",
    "Schemes:",
    ...schemeNames.map((schemeName) => `- ${schemeName}`),
    "",
    "Please report to the Directorate of Student Affairs, Room 19 with a letter to decline one support/Scholarship.",
    "",
    ...DECLINATION_MESSAGE_SIGNATURE
  ].join("\n");
}

function buildDeclinationSubject(group) {
  return `Duplicate support records for ${group.academicYearLabel}`;
}

function renderDeclinationTemplate(template, group) {
  const schemeNames = (group.schemes || []).map((item) => item.schemeName).filter(Boolean);
  const replacements = {
    studentName: group.fullName || "Student",
    studentReferenceId: group.studentReferenceId || "",
    academicYear: group.academicYearLabel || "",
    schemeList: schemeNames.map((schemeName) => `- ${schemeName}`).join("\n"),
    schemes: schemeNames.join(", ")
  };

  return String(template || "").replace(/\{\{\s*(studentName|studentReferenceId|academicYear|schemeList|schemes)\s*\}\}/gu, (_match, key) => replacements[key] || "");
}

function resolveDeclinationSubject(group, payload = {}) {
  const subjectTemplate = String(payload.subjectLine || "").trim();
  return subjectTemplate ? renderDeclinationTemplate(subjectTemplate, group) : buildDeclinationSubject(group);
}

function resolveDeclinationBody(group, payload = {}) {
  const bodyTemplate = String(payload.bodyTemplate || "").trim();
  return bodyTemplate ? renderDeclinationTemplate(bodyTemplate, group) : buildDeclinationMessage(group);
}

async function defaultDuplicateMessenger({ channel, to, subject, body }) {
  if (channel === "email") {
    if (!config.messaging.enabled || config.messaging.provider !== "brevo" || !config.messaging.brevoApiKey) {
      return {
        sent: false,
        errorMessage: "Email sending is not configured."
      };
    }
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.messaging.brevoApiKey
      },
      body: JSON.stringify({
        sender: {
          name: config.messaging.senderName,
          email: config.messaging.senderEmail
        },
        to: [{ email: to }],
        subject,
        textContent: body
      })
    });
    const payloadText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        sent: false,
        errorMessage: payloadText || "Email provider rejected the request."
      };
    }
    return {
      sent: true,
      providerMessageId: payloadText || null
    };
  }

  if (!config.messaging.smsEnabled) {
    return {
      sent: false,
      errorMessage: "SMS sending is not configured."
    };
  }

  if (config.messaging.smsProvider === "mnotify") {
    if (!config.messaging.mnotifyApiKey || !config.messaging.mnotifySenderId) {
      return {
        sent: false,
        errorMessage: "MNotify SMS credentials are not configured."
      };
    }
    const params = new URLSearchParams({ key: config.messaging.mnotifyApiKey });
    const response = await fetch(`https://api.mnotify.com/api/sms/quick?${params.toString()}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        recipient: [to],
        sender: config.messaging.mnotifySenderId,
        message: body,
        is_schedule: false,
        schedule_date: ""
      })
    });
    const payloadText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        sent: false,
        errorMessage: payloadText || "SMS provider rejected the request."
      };
    }
    return {
      sent: true,
      providerMessageId: payloadText || null
    };
  }

  return {
    sent: false,
    errorMessage: "The configured SMS provider is not supported for beneficiary duplicate requests."
  };
}

async function loadAllBeneficiaryRecords(repository) {
  const pageSize = 200;
  const records = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await repository.list({ page, pageSize });
    records.push(...(result.items || []));
    totalPages = Number(result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);
  return records;
}

async function resolveDuplicateContact(repositories, group, channel) {
  const fallbackEmail = group.records.find((item) => item.email)?.email || "";
  const fallbackPhone = group.records.find((item) => item.phoneNumber)?.phoneNumber || "";
  const lookup = repositories.students?.list
    ? await repositories.students.list({ studentReferenceId: group.studentReferenceId })
    : { items: [] };
  const student = (lookup.items || []).find(
    (item) =>
      String(item.studentReferenceId || "").trim().toLowerCase() ===
      String(group.studentReferenceId || "").trim().toLowerCase()
  );

  if (channel === "email") {
    return String(student?.email || fallbackEmail || "").trim();
  }
  return String(student?.phoneNumber || fallbackPhone || "").trim();
}

function getDuplicateContactOverride(payload = {}, group = {}, channel) {
  const overrides = payload.contactOverrides || {};
  const candidates = [
    overrides[group.groupKey],
    overrides[group.studentReferenceId],
    overrides[String(group.studentReferenceId || "").trim().toLowerCase()]
  ].filter(Boolean);
  const override = candidates[0] || {};
  if (channel === "email") {
    return String(override.email || "").trim();
  }
  return String(override.phoneNumber || override.phone || "").trim();
}

function buildCurrentDuplicateGroups(records = [], decisions = [], filters = {}) {
  const groups = new Map();
  for (const record of records) {
    const academicYearLabel = normalizeAcademicYearLabel(record.academicYearLabel);
    const studentReferenceId = String(record.studentReferenceId || "").trim();
    if (!academicYearLabel || !studentReferenceId) continue;
    const groupKey = buildDuplicateGroupKey(academicYearLabel, studentReferenceId);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        academicYearLabel,
        studentReferenceId,
        fullName: record.fullName || "",
        schemes: [],
        records: []
      });
    }

    const group = groups.get(groupKey);
    group.records.push(record);
    if (!group.contactEmail && record.email) {
      group.contactEmail = String(record.email || "").trim();
    }
    if (!group.contactPhoneNumber && record.phoneNumber) {
      group.contactPhoneNumber = String(record.phoneNumber || "").trim();
    }
    if (!group.fullName && record.fullName) {
      group.fullName = record.fullName;
    }
    const schemeName = normalizeSchemeName(record.schemeName);
    const existingScheme = group.schemes.find(
      (item) => item.schemeName.toLowerCase() === schemeName.toLowerCase()
    );
    if (existingScheme) {
      existingScheme.recordIds.push(String(record.id));
    } else if (schemeName) {
      group.schemes.push({
        schemeName,
        recordIds: [String(record.id)]
      });
    }
  }

  const decisionsByCurrentSignature = new Map();
  for (const decision of decisions || []) {
    const decisionGroupKey = buildDuplicateGroupKey(
      decision.academicYearLabel,
      decision.studentReferenceId
    );
    const signature = decision.schemeSignature || buildDuplicateSchemeSignature(decision.schemes || []);
    decisionsByCurrentSignature.set(`${decisionGroupKey}::${signature}`, decision);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      schemes: group.schemes.sort((left, right) => left.schemeName.localeCompare(right.schemeName)),
      schemeSignature: buildDuplicateSchemeSignature(group.schemes)
    }))
    .filter((group) => group.schemes.length > 1)
    .filter((group) => applyDuplicateGroupFilters(group, filters))
    .map((group) => {
      const decision = decisionsByCurrentSignature.get(`${group.groupKey}::${group.schemeSignature}`);
      if (decision?.status === "allowed_on_both") {
        return null;
      }
      return {
        ...group,
        decisionId: decision?.id || null,
        status: decision?.status === "awaiting_student_response" ? decision.status : "unresolved",
        contactEmail: group.contactEmail || "",
        contactPhoneNumber: group.contactPhoneNumber || "",
        requestedChannel: decision?.requestedChannel || null,
        requestedContact: decision?.requestedContact || null,
        requestedAt: decision?.requestedAt || null,
        requestedByName: decision?.requestedByName || null
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const statusDelta =
        (left.status === "unresolved" ? 0 : 1) - (right.status === "unresolved" ? 0 : 1);
      if (statusDelta !== 0) return statusDelta;
      return left.fullName.localeCompare(right.fullName);
    });
}

function buildBeneficiaryWaitlistLookupKey(payload = {}) {
  const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel || payload.cycleLabel);
  const schemeName = String(payload.schemeName || "").trim();
  const studentReferenceId = String(payload.studentReferenceId || "").trim();

  if (!academicYearLabel || !schemeName || !studentReferenceId) {
    return "";
  }

  return [
    normalizeLookupValue(academicYearLabel),
    normalizeLookupValue(schemeName),
    normalizeLookupValue(studentReferenceId)
  ].join("::");
}

function summarizeBeneficiaryCohorts(items = []) {
  const totals = {
    current: 0,
    new: 0,
    singleCycle: 0,
    carriedForward: 0
  };

  for (const item of items) {
    if (item?.beneficiaryCohort === "current") totals.current += 1;
    else if (item?.beneficiaryCohort === "new") totals.new += 1;
    else totals.singleCycle += 1;

    if (item?.carriedForwardFromPriorYear) {
      totals.carriedForward += 1;
    }
  }

  return totals;
}

async function resolveCurrentBeneficiaryYearLabel(repositories) {
  const activeSchemes = (await repositories.schemes.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  if (activeSchemes.length) {
    return activeSchemes[0];
  }

  const activeCycles = (await repositories.cycles.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.label || item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  return activeCycles[0] || "";
}

async function buildPromotedWaitlistLookup(repositories, items = []) {
  const importKeys = new Set((items || []).map((item) => buildBeneficiaryWaitlistLookupKey(item)).filter(Boolean));
  if (!importKeys.size) {
    return new Map();
  }

  const promotedEntries = await repositories.waitlist.list({ status: "promoted" });
  const lookup = new Map();

  for (const entry of promotedEntries || []) {
    const key = buildBeneficiaryWaitlistLookupKey(entry);
    if (!key || !importKeys.has(key) || lookup.has(key)) continue;
    lookup.set(key, entry);
  }

  return lookup;
}

export function createBeneficiaryService({ repositories, messaging = defaultDuplicateMessenger }) {
  async function completeDuplicateDeclination(group, payload = {}, actor) {
    const declinedSchemeName = normalizeSchemeName(payload.declinedSchemeName);
    const matchedScheme = (group.schemes || []).find(
      (item) => normalizeSchemeName(item.schemeName).toLowerCase() === declinedSchemeName.toLowerCase()
    );
    if (!matchedScheme) {
      throw new ValidationError("The declined scheme must be one of the student's duplicate schemes.");
    }

    const deleteResult = await repositories.beneficiaries.deleteDuplicateSchemeRecords({
      academicYearLabel: group.academicYearLabel,
      studentReferenceId: group.studentReferenceId,
      schemeName: matchedScheme.schemeName,
      reason: payload.notes || "Student submitted declination letter.",
      actor
    });
    const updated = await repositories.beneficiaries.upsertDuplicateDecision({
      academicYearLabel: group.academicYearLabel,
      studentReferenceId: group.studentReferenceId,
      fullName: group.fullName,
      schemes: group.schemes,
      schemeSignature: group.schemeSignature || buildDuplicateSchemeSignature(group.schemes || []),
      status: "declined_one_scheme",
      declinedSchemeName: matchedScheme.schemeName,
      resolvedByUserId: actor.userId || null,
      resolvedByName: normalizeActorName(actor),
      resolvedAt: new Date().toISOString(),
      notes: String(payload.notes || "").trim() || null,
      actor
    });
    await recordAuditEvent(repositories.audit, {
      actor,
      actionCode: "beneficiary.duplicate_declined",
      entityType: "beneficiary_duplicate",
      entityId: updated.id,
      summary: "Beneficiary duplicate support declination was confirmed.",
      metadata: {
        academicYearLabel: group.academicYearLabel,
        studentReferenceId: group.studentReferenceId,
        declinedSchemeName: matchedScheme.schemeName,
        deletedRows: deleteResult.deletedRows || 0
      }
    });

    return {
      ...updated,
      deletedRows: deleteResult.deletedRows || 0
    };
  }

  return {
    async list(filters = {}) {
      const [result, filterOptions] = await Promise.all([
        repositories.beneficiaries.list({
          academicYearLabel: String(filters.academicYearLabel || "").trim(),
          schemeName: normalizeSchemeName(filters.schemeName),
          college: String(filters.college || "").trim(),
          supportType: String(filters.supportType || "").trim(),
          beneficiaryCohort: String(filters.beneficiaryCohort || "").trim(),
          importMode: String(filters.importMode || "").trim(),
          page: Number(filters.page || 1),
          pageSize: Number(filters.pageSize || 50),
          q: String(filters.q || "").trim()
        }),
        repositories.beneficiaries.listFilterOptions()
      ]);

      return {
        total: result.total ?? 0,
        page: result.page ?? 1,
        pageSize: result.pageSize ?? 50,
        totalPages: result.totalPages ?? 1,
        items: result.items || [],
        filterOptions
      };
    },

    async getDashboard() {
      const currentYearLabel = await resolveCurrentBeneficiaryYearLabel(repositories);
      return repositories.beneficiaries.getDashboardData({ currentYearLabel });
    },

    async listDuplicateSupports(filters = {}) {
      const view = normalizeDuplicateView(filters.view);
      const [records, decisions, filterOptions] = await Promise.all([
        loadAllBeneficiaryRecords(repositories.beneficiaries),
        repositories.beneficiaries.listDuplicateDecisions?.({}) || [],
        repositories.beneficiaries.listFilterOptions()
      ]);
      const currentGroups = await Promise.all(
        buildCurrentDuplicateGroups(records, decisions, filters).map(async (group) => ({
          ...group,
          contactEmail: group.contactEmail || (await resolveDuplicateContact(repositories, group, "email")),
          contactPhoneNumber:
            group.contactPhoneNumber || (await resolveDuplicateContact(repositories, group, "sms"))
        }))
      );
      const resolvedItems = (decisions || [])
        .filter((item) => DUPLICATE_RESOLVED_STATUSES.has(item.status))
        .filter((item) =>
          applyDuplicateGroupFilters(
            {
              academicYearLabel: normalizeAcademicYearLabel(item.academicYearLabel),
              schemes: item.schemes || []
            },
            filters
          )
        )
        .sort((left, right) => new Date(right.resolvedAt || right.createdAt || 0) - new Date(left.resolvedAt || left.createdAt || 0));

      return {
        summary: {
          unresolvedCount: currentGroups.filter((item) => item.status === "unresolved").length,
          awaitingResponseCount: currentGroups.filter(
            (item) => item.status === "awaiting_student_response"
          ).length,
          resolvedCount: resolvedItems.length
        },
        items: view === "resolved" ? resolvedItems : currentGroups,
        filterOptions: {
          academicYears: filterOptions.academicYears || [],
          schemeNames: filterOptions.schemeNames || []
        }
      };
    },

    async allowDuplicateSupports(payload = {}, actor) {
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can allow duplicate beneficiary support.");
      }
      const groupKeys = [...new Set((payload.groupKeys || []).map((item) => String(item || "").trim()).filter(Boolean))];
      if (!groupKeys.length) {
        throw new ValidationError("Choose at least one duplicate support group.");
      }

      const records = await loadAllBeneficiaryRecords(repositories.beneficiaries);
      const decisions = await (repositories.beneficiaries.listDuplicateDecisions?.({}) || []);
      const currentGroups = buildCurrentDuplicateGroups(records, decisions, {});
      const currentByKey = new Map(currentGroups.map((group) => [group.groupKey, group]));
      const items = [];

      for (const groupKey of groupKeys) {
        const group = currentByKey.get(groupKey);
        if (!group) {
          continue;
        }
        const decision = await repositories.beneficiaries.upsertDuplicateDecision({
          academicYearLabel: group.academicYearLabel,
          studentReferenceId: group.studentReferenceId,
          fullName: group.fullName,
          schemes: group.schemes,
          schemeSignature: group.schemeSignature,
          status: "allowed_on_both",
          resolvedByUserId: actor.userId || null,
          resolvedByName: normalizeActorName(actor),
          resolvedAt: new Date().toISOString(),
          actor
        });
        items.push(decision);
        await recordAuditEvent(repositories.audit, {
          actor,
          actionCode: "beneficiary.duplicate_allowed",
          entityType: "beneficiary_duplicate",
          entityId: decision.id,
          summary: "Beneficiary duplicate support was allowed on both schemes.",
          metadata: {
            academicYearLabel: group.academicYearLabel,
            studentReferenceId: group.studentReferenceId,
            schemes: group.schemes.map((item) => item.schemeName)
          }
        });
      }

      return {
        summary: {
          allowedCount: items.length
        },
        items
      };
    },

    async sendDuplicateDeclinationRequests(payload = {}, actor) {
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can send duplicate beneficiary declination requests.");
      }
      const channel = normalizeDeclinationChannel(payload.channel);
      const groupKeys = [...new Set((payload.groupKeys || []).map((item) => String(item || "").trim()).filter(Boolean))];
      if (!groupKeys.length) {
        throw new ValidationError("Choose at least one duplicate support group.");
      }

      const records = await loadAllBeneficiaryRecords(repositories.beneficiaries);
      const decisions = await (repositories.beneficiaries.listDuplicateDecisions?.({}) || []);
      const currentGroups = buildCurrentDuplicateGroups(records, decisions, {});
      const currentByKey = new Map(currentGroups.map((group) => [group.groupKey, group]));
      const requested = [];
      const failed = [];

      for (const groupKey of groupKeys) {
        const group = currentByKey.get(groupKey);
        if (!group || group.status === "awaiting_student_response") {
          continue;
        }
        const contact =
          getDuplicateContactOverride(payload, group, channel) ||
          (await resolveDuplicateContact(repositories, group, channel));
        if (!contact) {
          failed.push({
            groupKey,
            fullName: group.fullName,
            studentReferenceId: group.studentReferenceId,
            message: channel === "email" ? "Student email is missing." : "Student phone number is missing."
          });
          continue;
        }

        const sendMessage = typeof messaging === "function" ? messaging : messaging?.send;
        const delivery = await sendMessage({
          channel,
          to: contact,
          subject: resolveDeclinationSubject(group, payload),
          body: resolveDeclinationBody(group, payload),
          group
        });
        if (!delivery?.sent) {
          failed.push({
            groupKey,
            fullName: group.fullName,
            studentReferenceId: group.studentReferenceId,
            message: delivery?.errorMessage || "The declination request could not be sent."
          });
          continue;
        }

        const decision = await repositories.beneficiaries.upsertDuplicateDecision({
          academicYearLabel: group.academicYearLabel,
          studentReferenceId: group.studentReferenceId,
          fullName: group.fullName,
          schemes: group.schemes,
          schemeSignature: group.schemeSignature,
          status: "awaiting_student_response",
          requestedChannel: channel,
          requestedContact: contact,
          deliveryStatus: "sent",
          deliveryMessageId: delivery.providerMessageId || null,
          requestedByUserId: actor.userId || null,
          requestedByName: normalizeActorName(actor),
          requestedAt: new Date().toISOString(),
          actor
        });
        requested.push(decision);
      }

      return {
        summary: {
          requestedCount: requested.length,
          failedCount: failed.length
        },
        items: requested,
        failed
      };
    },

    async confirmDuplicateDeclination(id, payload = {}, actor) {
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can confirm duplicate beneficiary declinations.");
      }
      const decisionId = String(id || "").trim();
      if (!decisionId) {
        throw new ValidationError("Choose the awaiting duplicate decision to confirm.");
      }
      const declinedSchemeName = normalizeSchemeName(payload.declinedSchemeName);
      if (!declinedSchemeName) {
        throw new ValidationError("Choose the scheme the student declined.");
      }
      if (payload.confirmed !== true) {
        throw new ValidationError("Please confirm that this is the scheme the student declined before finalising.");
      }

      const decision = await repositories.beneficiaries.getDuplicateDecision(decisionId);
      if (!decision) {
        throw new NotFoundError("Duplicate decision was not found.");
      }
      if (decision.status !== "awaiting_student_response") {
        throw new ValidationError("Only awaiting-response duplicate decisions can be confirmed.");
      }

      return completeDuplicateDeclination(decision, payload, actor);
    },

    async confirmDuplicateDeclinationForGroup(payload = {}, actor) {
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can confirm duplicate beneficiary declinations.");
      }
      const groupKey = String(payload.groupKey || "").trim();
      if (!groupKey) {
        throw new ValidationError("Choose the duplicate support group to resolve.");
      }
      const declinedSchemeName = normalizeSchemeName(payload.declinedSchemeName);
      if (!declinedSchemeName) {
        throw new ValidationError("Choose the scheme the student declined.");
      }
      if (payload.confirmed !== true) {
        throw new ValidationError("Please confirm that this is the scheme the student declined before finalising.");
      }

      const records = await loadAllBeneficiaryRecords(repositories.beneficiaries);
      const decisions = await (repositories.beneficiaries.listDuplicateDecisions?.({}) || []);
      const group = buildCurrentDuplicateGroups(records, decisions, {}).find(
        (item) => item.groupKey === groupKey
      );
      if (!group) {
        throw new NotFoundError("Duplicate support group was not found.");
      }
      if (!["unresolved", "awaiting_student_response"].includes(group.status || "unresolved")) {
        throw new ValidationError("Only unresolved duplicate support groups can be confirmed this way.");
      }

      return completeDuplicateDeclination(group, payload, actor);
    },

    async cancelDuplicateDeclinationRequest(id, payload = {}, actor) {
      if (!actor || actor.roleCode !== "admin") {
        throw new ValidationError("Only admins can cancel duplicate beneficiary declination requests.");
      }
      const decisionId = String(id || "").trim();
      if (!decisionId) {
        throw new ValidationError("Choose the pending duplicate decision to cancel.");
      }
      const decision = await repositories.beneficiaries.getDuplicateDecision(decisionId);
      if (!decision) {
        throw new NotFoundError("Duplicate decision was not found.");
      }
      if (decision.status !== "awaiting_student_response") {
        throw new ValidationError("Only awaiting-response duplicate decisions can be cancelled.");
      }
      const updated = await repositories.beneficiaries.updateDuplicateDecision(decisionId, {
        status: "request_cancelled",
        notes: String(payload.notes || "").trim() || null,
        actor
      });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.duplicate_request_cancelled",
        entityType: "beneficiary_duplicate",
        entityId: decisionId,
        summary: "Beneficiary duplicate support declination request was cancelled.",
        metadata: {
          academicYearLabel: decision.academicYearLabel,
          studentReferenceId: decision.studentReferenceId,
          notes: String(payload.notes || "").trim() || null
        }
      });

      return updated;
    },

    async previewImport(payload, progress) {
      const importMode = normalizeImportMode(payload.importMode);
      const duplicateStrategy = normalizeDuplicateStrategy(
        payload.duplicateStrategy,
        Boolean(payload.allowDuplicates)
      );
      const duplicateRowActions = Object.fromEntries(
        Object.entries(payload.duplicateRowActions || {}).map(([key, value]) => [
          Number(key),
          normalizeDuplicateStrategy(value, false)
        ])
      );
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!rows.length) {
        throw new ValidationError("Upload a beneficiary file before generating a preview.");
      }
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: 0,
        totalRows: rows.length,
        message: "Checking beneficiary rows..."
      });
      const previewSeed = buildBeneficiaryImportPreview(rows, {
        importMode,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        defaultBeneficiaryCohort: payload.beneficiaryCohort || "",
        defaultCurrency: normalizeCurrency(payload.defaultCurrency),
        duplicateStrategy,
        duplicateRowActions
      });
      const existingDuplicateKeys = await repositories.beneficiaries.findExistingDuplicateKeys(
        previewSeed.rows.map((row) => row.payload)
      );
      const crossScopeDuplicateStudentIds = new Set([
        ...(
          await repositories.beneficiaries.findCrossScopeDuplicateStudentIds(
            previewSeed.rows.map((row) => row.payload)
          )
        ),
        ...buildCrossScopeStudentIdSet(previewSeed.rows)
      ]);
      const crossScopeDuplicateMatches =
        await repositories.beneficiaries.findCrossScopeDuplicateMatches(
          previewSeed.rows.map((row) => row.payload)
        );
      const uploadDuplicateKeys = buildDuplicateKeySet(previewSeed.rows);
      const priorYearNewBeneficiaryKeys =
        importMode === "current_cycle_linked"
          ? await repositories.beneficiaries.findPriorYearNewBeneficiaryKeys(
              previewSeed.rows.map((row) => row.payload)
            )
          : new Set();

      const preview = buildBeneficiaryImportPreview(rows, {
        importMode,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        defaultBeneficiaryCohort: payload.beneficiaryCohort || "",
        defaultCurrency: normalizeCurrency(payload.defaultCurrency),
        duplicateStrategy,
        duplicateRowActions,
        existingDuplicateKeys,
        crossScopeDuplicateStudentIds,
        crossScopeDuplicateMatches,
        uploadDuplicateKeys,
        priorYearNewBeneficiaryKeys
      });
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: preview.summary.totalRows,
        totalRows: preview.summary.totalRows,
        message: "Beneficiary preview ready."
      });
      return preview;
    },

    async importRows(payload, actor, progress) {
      const importMode = normalizeImportMode(payload.importMode);
      const duplicateStrategy = normalizeDuplicateStrategy(
        payload.duplicateStrategy,
        Boolean(payload.allowDuplicates)
      );
      const duplicateRowActions = Object.fromEntries(
        Object.entries(payload.duplicateRowActions || {}).map(([key, value]) => [
          Number(key),
          normalizeDuplicateStrategy(value, false)
        ])
      );
      const preview = await this.previewImport(
        {
          ...payload,
          importMode,
          duplicateStrategy,
          duplicateRowActions
        },
        progress
      );
      const validRows = preview.rows.filter((row) => row.status === "valid");
      const rejectedRows = preview.rows.filter((row) => row.status !== "valid");

      if (!validRows.length) {
        throw new ValidationError("There are no valid beneficiary rows ready to import.");
      }

      const promotedWaitlistLookup =
        importMode === "current_cycle_linked"
          ? await buildPromotedWaitlistLookup(
              repositories,
              validRows.map((row) => row.payload)
            )
          : new Map();
      const importItems = validRows.map((row) => {
        const item = row.payload;
        const promotedWaitlistEntry = promotedWaitlistLookup.get(
          buildBeneficiaryWaitlistLookupKey(item)
        );

        return {
          ...item,
          duplicateStrategy: row.duplicateStrategy || duplicateStrategy,
          linkedApplicationId: promotedWaitlistEntry?.applicationId || null,
          linkedWaitlistEntryId: promotedWaitlistEntry?.id || null
        };
      });
      emitImportProgress(progress, {
        phase: "importing",
        processedRows: 0,
        totalRows: importItems.length,
        message: "Importing beneficiary rows..."
      });

      const result = await repositories.beneficiaries.importRows({
        items: importItems,
        importMode,
        sourceFileName: payload.fileName || null,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        beneficiaryCohort: payload.beneficiaryCohort || "",
        allowDuplicates: duplicateStrategy === "import_anyway",
        duplicateStrategy,
        duplicateRowActions,
        actor
      });
      emitImportProgress(progress, {
        phase: "importing",
        processedRows: result.items.length,
        totalRows: importItems.length,
        message: "Beneficiary rows imported."
      });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.imported",
        entityType: "beneficiary_import",
        entityId: result.batchReference || payload.fileName || "beneficiary-import",
        summary: "Beneficiary import completed.",
        metadata: result.summary
      });
      for (const item of result.items || []) {
        await recordAuditEvent(repositories.audit, {
          actor,
          actionCode: "beneficiary.updated",
          entityType: "beneficiary",
          entityId: item.id,
          summary: "Beneficiary record was imported.",
          metadata: {
            academicYearLabel: item.academicYearLabel,
            schemeName: item.schemeName,
            studentReferenceId: item.studentReferenceId || null
          }
        });
      }

      return {
        batchReference: result.batchReference,
        duplicateStrategy,
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: result.items.length,
          rejectedRows: rejectedRows.length,
          duplicateRows: preview.summary.duplicateRows || 0,
          crossScopeDuplicateRows: preview.summary.crossScopeDuplicateRows || 0,
          replacedRows: result.replacedRows || 0,
          cohortTotals: summarizeBeneficiaryCohorts(result.items)
        },
        preview,
        items: result.items,
        rejectedRows
      };
    },

    async updateRecord(id, payload = {}, actor) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to update.");
      }
      const reason = String(payload.reason || "").trim();
      if (!reason) {
        throw new ValidationError("Provide a short change reason before saving beneficiary updates.");
      }

      const updates = {};
      if (payload.fullName !== undefined) {
        const fullName = String(payload.fullName || "").trim();
        if (!fullName) {
          throw new ValidationError("Beneficiary full name cannot be blank.");
        }
        updates.fullName = fullName;
      }
      if (payload.amountPaid !== undefined) {
        const amountPaid = Number(payload.amountPaid);
        if (Number.isNaN(amountPaid) || amountPaid < 0) {
          throw new ValidationError("Amount paid must be a valid number.");
        }
        updates.amountPaid = amountPaid;
      }
      if (payload.academicYearLabel !== undefined) {
        const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
        if (!academicYearLabel) {
          throw new ValidationError("Academic year cannot be blank.");
        }
        updates.academicYearLabel = academicYearLabel;
      }
      if (payload.schemeName !== undefined) {
        const schemeName = String(payload.schemeName || "").trim();
        if (!schemeName) {
          throw new ValidationError("Support name cannot be blank.");
        }
      updates.schemeName = normalizeSchemeName(schemeName);
      }
      if (payload.sponsorName !== undefined) {
        updates.sponsorName = String(payload.sponsorName || "").trim() || null;
      }
      if (payload.studentReferenceId !== undefined) {
        const studentReferenceId = String(payload.studentReferenceId || "").trim();
        if (!studentReferenceId) {
          throw new ValidationError("Student reference ID cannot be blank.");
        }
        updates.studentReferenceId = studentReferenceId;
      }
      if (payload.indexNumber !== undefined) {
        updates.indexNumber = String(payload.indexNumber || "").trim() || null;
      }
      if (payload.currency !== undefined) {
        updates.currency = String(payload.currency || "").trim().toUpperCase() || "GHS";
      }
      if (payload.supportType !== undefined) {
        const supportType = normalizeSupportType(payload.supportType);
        if (supportType === "unknown") {
          throw new ValidationError("Support type must be either Internal or External.");
        }
        updates.supportType = supportType;
      }
      if (payload.college !== undefined) {
        updates.college = String(payload.college || "").trim() || null;
      }
      if (payload.remarks !== undefined) {
        updates.remarks = String(payload.remarks || "").trim() || null;
      }
      if (payload.beneficiaryCohort !== undefined) {
        updates.beneficiaryCohort = normalizeBeneficiaryCohort(payload.beneficiaryCohort);
      }

      if (!Object.keys(updates).length) {
        throw new ValidationError("Provide at least one beneficiary field to update.");
      }

      const item = await repositories.beneficiaries.updateRecord({
        id: recordId,
        updates,
        replaceExisting: Boolean(payload.replaceExisting),
        reason,
        actor
      });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.updated",
        entityType: "beneficiary",
        entityId: item.id || recordId,
        summary: "Beneficiary record was updated.",
        metadata: {
          reason
        }
      });
      return item;
    },

    async deleteRecord(id, payload = {}, actor) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to remove.");
      }
      const reason = String(payload.reason || "").trim();
      if (!reason) {
        throw new ValidationError("Provide a short reason before removing a beneficiary record.");
      }

      const result = await repositories.beneficiaries.deleteRecord({ id: recordId, reason, actor });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.deleted",
        entityType: "beneficiary",
        entityId: recordId,
        summary: "Beneficiary record was deleted.",
        metadata: {
          reason,
          deletedRows: result.deletedRows || 0
        }
      });
      return result;
    },

    async getImportHistory(filters = {}) {
      return repositories.beneficiaries.getImportHistory({
        academicYearLabel: String(filters.academicYearLabel || "").trim(),
        schemeName: String(filters.schemeName || "").trim()
      });
    },

    async getRecordHistory(id) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to review.");
      }

      return repositories.beneficiaries.getRecordHistory({ id: recordId });
    },

    async getAuditFeed(filters = {}) {
      return repositories.beneficiaries.getAuditFeed({
        academicYearLabel: String(filters.academicYearLabel || "").trim(),
        schemeName: String(filters.schemeName || "").trim(),
        eventType: String(filters.eventType || "").trim(),
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 50)
      });
    },

    async rollbackBatch(payload = {}, actor) {
      const batchReference = String(payload.batchReference || "").trim();
      if (!batchReference) {
        throw new ValidationError("Choose the import batch you want to roll back.");
      }
      const reason = String(payload.reason || "").trim();

      const result = await repositories.beneficiaries.rollbackBatch({
        batchReference,
        actor,
        reason
      });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.rollback",
        entityType: "beneficiary_import",
        entityId: batchReference,
        summary: "Beneficiary import batch was rolled back.",
        metadata: {
          reason,
          deletedRows: result.deletedRows || 0
        }
      });
      return result;
    },

    async clearBySchemeAndYear(payload = {}, actor) {
      const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
      const schemeName = normalizeSchemeName(payload.schemeName);
      const reason = String(payload.reason || "").trim() || "Scoped beneficiary clear";

      if (!academicYearLabel) {
        throw new ValidationError("Choose the academic year you want to clear.");
      }
      if (!schemeName) {
        throw new ValidationError("Choose the support name you want to clear.");
      }

      const result = await repositories.beneficiaries.clearBySchemeAndYear({
        academicYearLabel,
        schemeName,
        reason,
        actor
      });
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "beneficiary.cleared",
        entityType: "beneficiary_scope",
        entityId: `${academicYearLabel}:${schemeName}`,
        summary: "Beneficiary records were cleared for a scheme and year.",
        metadata: {
          academicYearLabel,
          schemeName,
          deletedRows: result.deletedRows || 0,
          reason
        }
      });

      return {
        summary: result,
        message:
          result.deletedRows > 0
            ? `Removed ${result.deletedRows} beneficiary record(s) for ${schemeName} in ${academicYearLabel}.`
            : `No beneficiary records matched ${schemeName} in ${academicYearLabel}.`
      };
    }
  };
}
