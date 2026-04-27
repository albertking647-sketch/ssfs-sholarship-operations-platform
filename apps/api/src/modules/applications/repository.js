import { applications, cycles, recommendations, schemes, students } from "../../data/sampleData.js";

const CWA_COVERAGE_DISPLAY_LIMIT = 40;

function parseReviewerMetadata(rawValue) {
  if (!rawValue) {
    return {
      noteText: null,
      uploadedFullName: null,
      uploadedStudentReferenceId: null,
      applicantEmail: null,
      uploadedProgram: null,
      documentChecklist: [],
      nameMismatchFlag: false,
      interviewStatus: null,
      interviewScore: null,
      interviewDate: null,
        interviewNotes: null,
        reviewDecision: null,
        reviewReason: null,
        reviewComment: null,
        outcomeDecision: null,
        outcomeAmount: null,
        outcomeNotes: null,
        outcomeUpdatedAt: null,
        outcomeUpdatedByUserId: null,
        outcomeUpdatedByName: null,
        reviewUpdatedAt: null,
        reviewedByUserId: null,
        reviewedByName: null
    };
  }

  if (typeof rawValue === "object") {
      return {
        noteText: rawValue.noteText || null,
        uploadedFullName: rawValue.uploadedFullName || null,
        uploadedStudentReferenceId: rawValue.uploadedStudentReferenceId || null,
        applicantEmail: rawValue.applicantEmail || null,
          uploadedProgram: rawValue.uploadedProgram || null,
          documentChecklist: Array.isArray(rawValue.documentChecklist) ? rawValue.documentChecklist : [],
          nameMismatchFlag: Boolean(rawValue.nameMismatchFlag),
        interviewStatus: rawValue.interviewStatus || null,
        interviewScore: rawValue.interviewScore === undefined || rawValue.interviewScore === null || rawValue.interviewScore === ""
          ? null
          : Number(rawValue.interviewScore),
        interviewDate: rawValue.interviewDate || null,
        interviewNotes: rawValue.interviewNotes || null,
        reviewDecision: rawValue.reviewDecision || null,
        reviewReason: rawValue.reviewReason || null,
        reviewComment: rawValue.reviewComment || null,
        outcomeDecision: rawValue.outcomeDecision || null,
        outcomeAmount:
          rawValue.outcomeAmount === undefined || rawValue.outcomeAmount === null || rawValue.outcomeAmount === ""
            ? null
            : Number(rawValue.outcomeAmount),
        outcomeNotes: rawValue.outcomeNotes || null,
        outcomeUpdatedAt: rawValue.outcomeUpdatedAt || null,
        outcomeUpdatedByUserId: rawValue.outcomeUpdatedByUserId || null,
        outcomeUpdatedByName: rawValue.outcomeUpdatedByName || null,
        reviewUpdatedAt: rawValue.reviewUpdatedAt || null,
        reviewedByUserId: rawValue.reviewedByUserId || null,
        reviewedByName: rawValue.reviewedByName || null
      };
    }

  try {
    const parsed = JSON.parse(String(rawValue));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
          noteText: parsed.noteText || null,
          uploadedFullName: parsed.uploadedFullName || null,
          uploadedStudentReferenceId: parsed.uploadedStudentReferenceId || null,
          applicantEmail: parsed.applicantEmail || null,
          uploadedProgram: parsed.uploadedProgram || null,
          documentChecklist: Array.isArray(parsed.documentChecklist) ? parsed.documentChecklist : [],
          nameMismatchFlag: Boolean(parsed.nameMismatchFlag),
        interviewStatus: parsed.interviewStatus || null,
        interviewScore: parsed.interviewScore === undefined || parsed.interviewScore === null || parsed.interviewScore === ""
          ? null
          : Number(parsed.interviewScore),
        interviewDate: parsed.interviewDate || null,
        interviewNotes: parsed.interviewNotes || null,
        reviewDecision: parsed.reviewDecision || null,
        reviewReason: parsed.reviewReason || null,
        reviewComment: parsed.reviewComment || null,
        outcomeDecision: parsed.outcomeDecision || null,
        outcomeAmount:
          parsed.outcomeAmount === undefined || parsed.outcomeAmount === null || parsed.outcomeAmount === ""
            ? null
            : Number(parsed.outcomeAmount),
        outcomeNotes: parsed.outcomeNotes || null,
        outcomeUpdatedAt: parsed.outcomeUpdatedAt || null,
        outcomeUpdatedByUserId: parsed.outcomeUpdatedByUserId || null,
        outcomeUpdatedByName: parsed.outcomeUpdatedByName || null,
        reviewUpdatedAt: parsed.reviewUpdatedAt || null,
        reviewedByUserId: parsed.reviewedByUserId || null,
        reviewedByName: parsed.reviewedByName || null
      };
    }
  } catch {
    return {
      noteText: String(rawValue),
      uploadedFullName: null,
      uploadedStudentReferenceId: null,
      applicantEmail: null,
      uploadedProgram: null,
      documentChecklist: [],
      nameMismatchFlag: false,
      interviewStatus: null,
      interviewScore: null,
      interviewDate: null,
        interviewNotes: null,
        reviewDecision: null,
        reviewReason: null,
        reviewComment: null,
        outcomeDecision: null,
        outcomeAmount: null,
        outcomeNotes: null,
        outcomeUpdatedAt: null,
        outcomeUpdatedByUserId: null,
        outcomeUpdatedByName: null,
        reviewUpdatedAt: null,
        reviewedByUserId: null,
        reviewedByName: null
    };
  }

  return {
    noteText: String(rawValue),
    uploadedFullName: null,
    uploadedStudentReferenceId: null,
    applicantEmail: null,
    uploadedProgram: null,
    documentChecklist: [],
    nameMismatchFlag: false,
    interviewStatus: null,
    interviewScore: null,
    interviewDate: null,
      interviewNotes: null,
      reviewDecision: null,
      reviewReason: null,
      reviewComment: null,
      outcomeDecision: null,
      outcomeAmount: null,
      outcomeNotes: null,
      outcomeUpdatedAt: null,
      outcomeUpdatedByUserId: null,
      outcomeUpdatedByName: null,
      reviewUpdatedAt: null,
      reviewedByUserId: null,
      reviewedByName: null
  };
}

function serializeReviewerMetadata(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify({
      noteText: value.noteText || null,
      uploadedFullName: value.uploadedFullName || null,
      uploadedStudentReferenceId: value.uploadedStudentReferenceId || null,
      applicantEmail: value.applicantEmail || null,
      uploadedProgram: value.uploadedProgram || null,
      documentChecklist: Array.isArray(value.documentChecklist) ? value.documentChecklist : [],
      nameMismatchFlag: Boolean(value.nameMismatchFlag),
    interviewStatus: value.interviewStatus || null,
    interviewScore:
      value.interviewScore === undefined || value.interviewScore === null || value.interviewScore === ""
        ? null
        : Number(value.interviewScore),
    interviewDate: value.interviewDate || null,
    interviewNotes: value.interviewNotes || null,
    reviewDecision: value.reviewDecision || null,
    reviewReason: value.reviewReason || null,
    reviewComment: value.reviewComment || null,
    outcomeDecision: value.outcomeDecision || null,
    outcomeAmount:
      value.outcomeAmount === undefined || value.outcomeAmount === null || value.outcomeAmount === ""
        ? null
        : Number(value.outcomeAmount),
    outcomeNotes: value.outcomeNotes || null,
    outcomeUpdatedAt: value.outcomeUpdatedAt || null,
    outcomeUpdatedByUserId: value.outcomeUpdatedByUserId || null,
    outcomeUpdatedByName: value.outcomeUpdatedByName || null,
    reviewUpdatedAt: value.reviewUpdatedAt || null,
    reviewedByUserId: value.reviewedByUserId || null,
    reviewedByName: value.reviewedByName || null
  });
}

function deriveQualificationStatus(record) {
  if (record.reviewDecision) {
    return record.reviewDecision;
  }

  switch (record.eligibilityStatus) {
    case "eligible":
      return "qualified";
    case "ineligible":
      return "disqualified";
    case "requires_review":
      return "pending";
    case "pending":
    default:
      return "not_reviewed";
  }
}

function deriveOutcomeDecision(record) {
  if (record.outcomeDecision) {
    return record.outcomeDecision;
  }

  if (["awarded", "waitlisted", "not_selected"].includes(record.status)) {
    return record.status;
  }

  return null;
}

function includesText(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").toLowerCase());
}

function matchesApplicationFilters(record, filters = {}) {
  if (filters.id && record.id !== filters.id) return false;
  if (filters.studentId && record.studentId !== filters.studentId) return false;
  if (filters.schemeId && record.schemeId !== filters.schemeId) return false;
  if (filters.cycleId && record.cycleId !== filters.cycleId) return false;
  if (filters.status && record.status !== filters.status) return false;
  if (
    filters.studentReferenceId &&
    record.studentReferenceId !== filters.studentReferenceId &&
    record.uploadedStudentReferenceId !== filters.studentReferenceId
  ) {
    return false;
  }
  if (filters.qualificationStatus && record.qualificationStatus !== filters.qualificationStatus) {
    return false;
  }
  if (
    String(filters.nameMismatchOnly || "").toLowerCase() === "true" &&
    !record.nameMismatchFlag
  ) {
    return false;
  }
  if (filters.q) {
    const query = String(filters.q || "");
    const haystack = [
      record.studentName,
      record.studentReferenceId,
      record.uploadedStudentReferenceId,
      record.indexNumber,
      record.schemeName,
      record.cycleLabel,
      record.program,
      record.college
    ];
    if (!haystack.some((value) => includesText(value, query))) {
      return false;
    }
  }
  return true;
}

function buildApplicationSummary(records) {
  const qualifiedCount = records.filter((item) => item.qualificationStatus === "qualified").length;
  const pendingCount = records.filter((item) => item.qualificationStatus === "pending").length;
  const disqualifiedCount = records.filter(
    (item) => item.qualificationStatus === "disqualified"
  ).length;
  const notReviewedCount = records.filter(
    (item) => item.qualificationStatus === "not_reviewed"
  ).length;

  return {
    totalApplications: records.length,
    reviewedCount: qualifiedCount + pendingCount + disqualifiedCount,
    qualifiedCount,
    pendingCount,
    disqualifiedCount,
    notReviewedCount
  };
}

function buildApplicationCwaCoverage(records) {
  const matchedItems = records.filter((item) => item.cwa !== null && item.cwa !== undefined);
  const missingItems = records.filter((item) => item.cwa === null || item.cwa === undefined);

  return {
    summary: {
      totalApplications: records.length,
      matchedCwaCount: matchedItems.length,
      missingCwaCount: missingItems.length,
      coveragePercentage: records.length
        ? Math.round((matchedItems.length / records.length) * 1000) / 10
        : 0
    },
    missingItems: missingItems.slice(0, CWA_COVERAGE_DISPLAY_LIMIT),
    totalMissingItems: missingItems.length,
    returnedMissingItems: Math.min(missingItems.length, CWA_COVERAGE_DISPLAY_LIMIT),
    missingItemsTruncated: missingItems.length > CWA_COVERAGE_DISPLAY_LIMIT
  };
}

function mapApplicationRecord(application) {
  const student = students.find((item) => item.id === application.studentId);
  const scheme = schemes.find((item) => item.id === application.schemeId);
  const cycle = cycles.find((item) => item.id === application.cycleId);
  const recommendation = recommendations.find((item) => item.applicationId === application.id);
  const reviewerMeta = parseReviewerMetadata(application.reviewerNotes);

  const record = {
    id: application.id,
    studentId: application.studentId,
    studentName: student?.fullName || null,
    studentReferenceId: student?.studentReferenceId || null,
    indexNumber: student?.indexNumber || null,
    email: student?.email || reviewerMeta.applicantEmail || null,
    applicantEmail: reviewerMeta.applicantEmail || null,
    registryEmail: student?.email || null,
    phoneNumber: student?.phoneNumber || null,
    studentPhoneNumber: student?.phoneNumber || null,
    college: student?.college || null,
    program: student?.program || null,
    year: student?.year || null,
    cwa: student?.cwa ?? null,
    wassceAggregate: student?.wassceAggregate ?? null,
    schemeId: application.schemeId,
    schemeName: scheme?.name || null,
    cycleId: application.cycleId,
    cycleLabel: cycle?.label || application.cycle || null,
    status: application.status,
    eligibilityStatus: application.eligibilityStatus,
    needCategory: application.needCategory || null,
    needScore: application.needScore ?? null,
    finalScore: recommendation?.finalScore ?? application.finalScore ?? null,
    recommendationId: recommendation?.id || null,
    recommendationStatus: recommendation?.status || application.recommendationStatus || null,
    recommendedAmount: recommendation?.recommendedAmount ?? application.recommendedAmount ?? null,
      reviewerNotes: reviewerMeta.noteText,
      uploadedFullName: reviewerMeta.uploadedFullName,
      uploadedStudentReferenceId: reviewerMeta.uploadedStudentReferenceId,
      uploadedProgram: reviewerMeta.uploadedProgram,
      documentChecklist: reviewerMeta.documentChecklist,
      nameMismatchFlag: reviewerMeta.nameMismatchFlag,
      interviewStatus: reviewerMeta.interviewStatus,
      interviewScore: reviewerMeta.interviewScore,
      interviewDate: reviewerMeta.interviewDate,
      interviewNotes: reviewerMeta.interviewNotes,
      reviewReason: reviewerMeta.reviewReason,
      reviewComment: reviewerMeta.reviewComment,
      reviewDecision: reviewerMeta.reviewDecision,
      reviewUpdatedAt: reviewerMeta.reviewUpdatedAt,
      reviewedByUserId: reviewerMeta.reviewedByUserId,
      reviewedByName: reviewerMeta.reviewedByName,
      outcomeDecision: reviewerMeta.outcomeDecision,
      outcomeAmount: reviewerMeta.outcomeAmount,
      outcomeNotes: reviewerMeta.outcomeNotes,
      outcomeUpdatedAt: reviewerMeta.outcomeUpdatedAt,
      outcomeUpdatedByUserId: reviewerMeta.outcomeUpdatedByUserId,
      outcomeUpdatedByName: reviewerMeta.outcomeUpdatedByName,
      submittedAt: application.submittedAt || null
    };

  return {
    ...record,
    qualificationStatus: deriveQualificationStatus(record),
    outcomeDecision: deriveOutcomeDecision(record)
  };
}

function createSampleRepository() {
  const messageBatches = [];
  const messageBatchItems = [];
  const importIssues = [];

  return {
    async list(filters = {}) {
      return applications.map(mapApplicationRecord).filter((record) => matchesApplicationFilters(record, filters));
    },
    async getById(id) {
      const application = applications.find((item) => item.id === id);
      return application ? mapApplicationRecord(application) : null;
    },
    async findExisting(studentId, schemeId, cycleId) {
      const application = applications.find(
        (item) =>
          item.studentId === studentId &&
          item.schemeId === schemeId &&
          item.cycleId === cycleId
      );

      return application ? mapApplicationRecord(application) : null;
    },
    async findExistingForStudents(studentIds, schemeId, cycleId) {
      const uniqueIds = Array.from(new Set((studentIds || []).filter(Boolean)));
      const items = applications
        .filter(
          (item) =>
            uniqueIds.includes(item.studentId) &&
            item.schemeId === schemeId &&
            item.cycleId === cycleId
        )
        .map(mapApplicationRecord);

      return new Map(items.map((item) => [item.studentId, item]));
    },
    async summary(filters = {}) {
      const records = applications
        .map(mapApplicationRecord)
        .filter((record) => matchesApplicationFilters(record, filters));
      return buildApplicationSummary(records);
    },
    async cwaCoverage(filters = {}) {
      const records = applications
        .map(mapApplicationRecord)
        .filter((record) => matchesApplicationFilters(record, filters));
      return buildApplicationCwaCoverage(records);
    },
    async create(input) {
      applications.unshift({
        ...input,
        reviewerNotes: serializeReviewerMetadata(input.reviewerMetadata ?? input.reviewerNotes)
      });
      if (
        input.finalScore !== null ||
        input.recommendationStatus ||
        input.recommendedAmount !== null
      ) {
        recommendations.unshift({
          id: `recommendation-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          applicationId: input.id,
          finalScore: input.finalScore ?? null,
          priorityRank: null,
          status: input.recommendationStatus || "pending",
          recommendedAmount: input.recommendedAmount ?? null
        });
      }
      return mapApplicationRecord(applications[0]);
    },
    async updateReview(id, input) {
      const application = applications.find((item) => item.id === id);
      if (!application) {
        return null;
      }

      application.status = input.status;
      application.eligibilityStatus = input.eligibilityStatus;
      application.reviewerNotes = serializeReviewerMetadata(input.reviewerMetadata);
      return mapApplicationRecord(application);
    },
    async bulkUpdateInterview(input) {
      const matchingApplications = applications.filter(
        (item) => String(item.schemeId) === String(input.schemeId) && String(item.cycleId) === String(input.cycleId)
      );

      for (const application of matchingApplications) {
        const reviewerMeta = parseReviewerMetadata(application.reviewerNotes);
        application.reviewerNotes = serializeReviewerMetadata({
          ...reviewerMeta,
          interviewStatus: input.interviewStatus,
          interviewDate: input.interviewDate || reviewerMeta.interviewDate || null,
          interviewNotes: input.interviewNotes || reviewerMeta.interviewNotes || null,
          reviewUpdatedAt: new Date().toISOString(),
          reviewedByUserId: input.reviewedByUserId || reviewerMeta.reviewedByUserId || null,
          reviewedByName: input.reviewedByName || reviewerMeta.reviewedByName || null
        });
      }

      return {
        updatedApplications: matchingApplications.length
      };
    },
    async bulkUpdateOutcomes(input) {
      const matchingApplications = applications
        .map(mapApplicationRecord)
        .filter(
          (item) =>
            String(item.schemeId) === String(input.schemeId) &&
            String(item.cycleId) === String(input.cycleId) &&
            item.qualificationStatus === input.sourceQualificationStatus
        );

      for (const record of matchingApplications) {
        const application = applications.find((item) => item.id === record.id);
        if (!application) continue;

        const reviewerMeta = parseReviewerMetadata(application.reviewerNotes);
        application.status = input.outcomeDecision;
        application.reviewerNotes = serializeReviewerMetadata({
          ...reviewerMeta,
          outcomeDecision: input.outcomeDecision,
          outcomeAmount: input.outcomeAmount ?? null,
          outcomeNotes: input.outcomeNotes || reviewerMeta.outcomeNotes || null,
          outcomeUpdatedAt: new Date().toISOString(),
          outcomeUpdatedByUserId:
            input.outcomeUpdatedByUserId || reviewerMeta.outcomeUpdatedByUserId || null,
          outcomeUpdatedByName:
            input.outcomeUpdatedByName || reviewerMeta.outcomeUpdatedByName || null
        });
      }

      return {
        updatedApplications: matchingApplications.length
      };
    },
    async listImportIssues(filters = {}) {
      return importIssues
        .filter((item) => {
          if (filters.schemeId && String(item.schemeId) !== String(filters.schemeId)) return false;
          if (filters.cycleId && String(item.cycleId) !== String(filters.cycleId)) return false;
          if (filters.status && String(item.status) !== String(filters.status)) return false;
          return true;
        })
        .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime());
    },
    async replaceImportIssues(input) {
      for (let index = importIssues.length - 1; index >= 0; index -= 1) {
        const item = importIssues[index];
        if (
          String(item.schemeId) === String(input.schemeId) &&
          String(item.cycleId) === String(input.cycleId) &&
          String(item.sourceType || "") === String(input.sourceType || "application_import") &&
          String(item.status || "open") === "open"
        ) {
          importIssues.splice(index, 1);
        }
      }

      const createdAt = new Date().toISOString();
      for (const item of input.items || []) {
        importIssues.unshift({
          id: createId("application-issue"),
          schemeId: input.schemeId,
          cycleId: input.cycleId,
          sourceType: input.sourceType || "application_import",
          rowNumber: item.rowNumber || null,
          studentReferenceId: item.studentReferenceId || null,
          fullName: item.fullName || null,
          payload: item.payload || {},
          issues: Array.isArray(item.issues) ? item.issues : [],
          status: "open",
          resolutionNotes: null,
          linkedApplicationId: null,
          resolvedByUserId: null,
          resolvedByName: null,
          createdAt,
          updatedAt: createdAt,
          resolvedAt: null
        });
      }

      return this.listImportIssues({
        schemeId: input.schemeId,
        cycleId: input.cycleId,
        status: "open"
      });
    },
    async resolveImportIssue(issueId, payload = {}) {
      const item = importIssues.find((entry) => String(entry.id) === String(issueId));
      if (!item) {
        return null;
      }

      item.status = "resolved";
      item.resolutionNotes = payload.resolutionNotes || null;
      item.linkedApplicationId = payload.linkedApplicationId || null;
      item.resolvedByUserId = payload.resolvedByUserId || null;
      item.resolvedByName = payload.resolvedByName || null;
      item.resolvedAt = new Date().toISOString();
      item.updatedAt = item.resolvedAt;
      return item;
    },
    async listMessageBatches(filters = {}) {
      return messageBatches
        .filter((batch) => {
          if (filters.schemeId && String(batch.schemeId) !== String(filters.schemeId)) return false;
          if (filters.cycleId && String(batch.cycleId) !== String(filters.cycleId)) return false;
          return true;
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((batch) => ({
          ...batch,
          items: messageBatchItems.filter((item) => item.batchId === batch.id)
        }));
    },
    async createMessageBatch(input) {
      const createdAt = new Date().toISOString();
      const batch = {
        id: createId("message-batch"),
        schemeId: input.schemeId,
        cycleId: input.cycleId,
        channel: input.channel || "email",
        messageType: input.messageType,
        senderEmail: input.senderEmail,
        subjectLine: input.subjectLine,
        bodyTemplate: input.bodyTemplate,
        recipientCount: Array.isArray(input.items) ? input.items.length : 0,
        status: input.status || "logged",
        createdAt,
        createdByUserId: input.createdByUserId || null,
        createdByName: input.createdByName || null
      };
      messageBatches.unshift(batch);

        for (const item of input.items || []) {
          messageBatchItems.unshift({
            id: createId("message-item"),
            batchId: batch.id,
            applicationId: item.applicationId || null,
            studentId: item.studentId || null,
            recipientEmail: item.recipientEmail || null,
            recipientPhone: item.recipientPhone || null,
            recipientName: item.recipientName || null,
            deliveryStatus: item.deliveryStatus || "logged",
            errorMessage: item.errorMessage || null,
            providerMessageId: item.providerMessageId || null,
            updatedAt: null,
            createdAt
          });
        }

      return {
        ...batch,
        items: messageBatchItems.filter((item) => item.batchId === batch.id)
      };
    },
    async updateMessageBatchDelivery(batchId, payload) {
      const batch = messageBatches.find((item) => item.id === batchId);
      if (!batch) {
        return null;
      }

      batch.status = payload.status || batch.status;
      const updatedAt = new Date().toISOString();
      for (const update of payload.items || []) {
        const item = messageBatchItems.find(
          (entry) => entry.batchId === batchId && String(entry.id) === String(update.id)
        );
        if (!item) continue;
        item.deliveryStatus = update.deliveryStatus || item.deliveryStatus;
        item.errorMessage = update.errorMessage ?? item.errorMessage ?? null;
        item.providerMessageId = update.providerMessageId ?? item.providerMessageId ?? null;
        item.updatedAt = updatedAt;
      }

      return {
        ...batch,
        items: messageBatchItems.filter((item) => item.batchId === batch.id)
      };
    }
  };
}

function mapApplicationRow(row) {
  const reviewerMeta = parseReviewerMetadata(row.reviewer_notes);

  const record = {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentReferenceId: row.student_reference_id,
    indexNumber: row.index_number,
    email: row.email || reviewerMeta.applicantEmail || null,
    applicantEmail: reviewerMeta.applicantEmail || null,
    registryEmail: row.email || null,
    phoneNumber: row.phone_number || null,
    studentPhoneNumber: row.phone_number || null,
    college: row.college,
    program: row.program_name,
    year: row.year_of_study,
    cwa: row.cwa === null ? null : Number(row.cwa),
    wassceAggregate: row.wassce_aggregate === null ? null : Number(row.wassce_aggregate),
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    cycleId: row.cycle_id,
    cycleLabel: row.cycle_label,
    status: row.status,
    eligibilityStatus: row.eligibility_status,
    needCategory: row.need_category,
    needScore: row.need_score === null ? null : Number(row.need_score),
    finalScore: row.final_score === null ? null : Number(row.final_score),
    recommendationId: row.recommendation_id,
    recommendationStatus: row.recommendation_status,
    recommendedAmount: row.recommended_amount === null ? null : Number(row.recommended_amount),
      reviewerNotes: reviewerMeta.noteText,
      uploadedFullName: reviewerMeta.uploadedFullName,
      uploadedStudentReferenceId: reviewerMeta.uploadedStudentReferenceId,
      uploadedProgram: reviewerMeta.uploadedProgram,
      documentChecklist: reviewerMeta.documentChecklist,
      nameMismatchFlag: reviewerMeta.nameMismatchFlag,
      interviewStatus: reviewerMeta.interviewStatus,
      interviewScore: reviewerMeta.interviewScore,
      interviewDate: reviewerMeta.interviewDate,
      interviewNotes: reviewerMeta.interviewNotes,
      reviewReason: reviewerMeta.reviewReason,
      reviewComment: reviewerMeta.reviewComment,
      reviewDecision: reviewerMeta.reviewDecision,
      reviewUpdatedAt: reviewerMeta.reviewUpdatedAt,
      reviewedByUserId: reviewerMeta.reviewedByUserId,
      reviewedByName: reviewerMeta.reviewedByName,
      outcomeDecision: reviewerMeta.outcomeDecision,
      outcomeAmount: reviewerMeta.outcomeAmount,
      outcomeNotes: reviewerMeta.outcomeNotes,
      outcomeUpdatedAt: reviewerMeta.outcomeUpdatedAt,
      outcomeUpdatedByUserId: reviewerMeta.outcomeUpdatedByUserId,
      outcomeUpdatedByName: reviewerMeta.outcomeUpdatedByName,
      submittedAt: row.submitted_at
    };

  return {
    ...record,
    qualificationStatus: deriveQualificationStatus(record),
    outcomeDecision: deriveOutcomeDecision(record)
  };
}

function toDatabaseUserId(actor) {
  return /^\d+$/.test(String(actor?.userId || "")) ? Number(actor.userId) : null;
}

function normalizeDatabaseUserId(value) {
  return /^\d+$/.test(String(value || "")) ? String(value) : null;
}

function createPostgresRepository(database) {
  let academicProfileSchemaPromise;
  let ensuredAcademicProfileColumns = false;
  let messagingSchemaEnsured = false;
  let issueQueueSchemaEnsured = false;

  async function ensureAcademicProfileColumns() {
    if (ensuredAcademicProfileColumns) {
      return;
    }

    await database.query(`
      ALTER TABLE academic_profiles
      ADD COLUMN IF NOT EXISTS semester_label TEXT
    `);

    ensuredAcademicProfileColumns = true;
    academicProfileSchemaPromise = null;
  }

  async function ensureMessagingSchema() {
    if (messagingSchemaEnsured) {
      return;
    }

    await database.query(`
      CREATE TABLE IF NOT EXISTS application_message_batches (
        id BIGSERIAL PRIMARY KEY,
        scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
        cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'email',
        message_type TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        subject_line TEXT NOT NULL,
        body_template TEXT NOT NULL,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'logged',
        created_by BIGINT REFERENCES users(id),
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await database.query(`
      ALTER TABLE application_message_batches
      ADD COLUMN IF NOT EXISTS created_by_name TEXT
    `);

    await database.query(`
      ALTER TABLE application_message_batches
      ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    `);

      await database.query(`
        CREATE TABLE IF NOT EXISTS application_message_batch_items (
          id BIGSERIAL PRIMARY KEY,
          batch_id BIGINT NOT NULL REFERENCES application_message_batches(id) ON DELETE CASCADE,
          application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
        student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
        recipient_email TEXT,
        recipient_phone TEXT,
        recipient_name TEXT,
        delivery_status TEXT NOT NULL DEFAULT 'logged',
        error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await database.query(`
        ALTER TABLE application_message_batch_items
        ADD COLUMN IF NOT EXISTS provider_message_id TEXT
      `);

      await database.query(`
        ALTER TABLE application_message_batch_items
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      `);

      await database.query(`
        ALTER TABLE application_message_batch_items
        ADD COLUMN IF NOT EXISTS recipient_phone TEXT
      `);

    messagingSchemaEnsured = true;
  }

  async function ensureIssueQueueSchema() {
    if (issueQueueSchemaEnsured) {
      return;
    }

    await database.query(`
      CREATE TABLE IF NOT EXISTS application_import_issues (
        id BIGSERIAL PRIMARY KEY,
        scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
        cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL DEFAULT 'application_import',
        row_number INTEGER,
        student_reference_id TEXT,
        full_name TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        issues JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'open',
        resolution_notes TEXT,
        linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
        resolved_by BIGINT REFERENCES users(id),
        resolved_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);

    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_application_import_issues_scope
      ON application_import_issues (scheme_id, cycle_id, status, created_at DESC)
    `);

    issueQueueSchemaEnsured = true;
  }

  async function getAcademicProfileSchema() {
    await ensureAcademicProfileColumns();
    if (!academicProfileSchemaPromise) {
      academicProfileSchemaPromise = database
        .query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'academic_profiles'
          `
        )
        .then((result) => new Set(result.rows.map((row) => row.column_name)));
    }

    return academicProfileSchemaPromise;
  }

  async function getAcademicProfileMapping() {
    const columns = await getAcademicProfileSchema();

    return {
      yearColumn: columns.has("year_of_study")
        ? "year_of_study"
        : columns.has("level_label")
          ? "level_label"
          : null,
      academicYearLabelColumn: columns.has("academic_year_label") ? "academic_year_label" : null,
      semesterColumn: columns.has("semester_label") ? "semester_label" : null,
      cwaColumn: columns.has("cwa") ? "cwa" : columns.has("cgpa") ? "cgpa" : null,
      wassceAggregateColumn: columns.has("wassce_aggregate") ? "wassce_aggregate" : null
    };
  }

  function buildAcademicProfileOrderClause(alias, profileMapping) {
    const parts = [];

    if (profileMapping.academicYearLabelColumn) {
      parts.push(`
        CASE
          WHEN ${alias}.${profileMapping.academicYearLabelColumn} ~ '^[0-9]{4}/[0-9]{4}$'
            THEN split_part(${alias}.${profileMapping.academicYearLabelColumn}, '/', 1)::int
          ELSE 0
        END DESC
      `);
    }

    if (profileMapping.semesterColumn) {
      parts.push(`
        CASE LOWER(COALESCE(${alias}.${profileMapping.semesterColumn}, ''))
          WHEN 'first semester' THEN 1
          WHEN 'semester 1' THEN 1
          WHEN 'second semester' THEN 2
          WHEN 'semester 2' THEN 2
          WHEN 'third semester' THEN 3
          WHEN 'semester 3' THEN 3
          WHEN 'final results' THEN 4
          WHEN 'full year' THEN 4
          WHEN 'annual' THEN 4
          ELSE 0
        END DESC
      `);
    }

    parts.push(`${alias}.created_at DESC`);
    return parts.join(", ");
  }

  function buildReviewDecisionExpression(alias = "a") {
    return `
      CASE
        WHEN ${alias}.reviewer_notes IS NOT NULL
          AND ${alias}.reviewer_notes ~ '^\\s*\\{'
        THEN ${alias}.reviewer_notes::jsonb ->> 'reviewDecision'
        ELSE NULL
      END
    `;
  }

  function buildQualificationStatusExpression(alias = "a") {
    const reviewDecisionExpression = buildReviewDecisionExpression(alias);
    return `
      CASE
        WHEN ${reviewDecisionExpression} IN ('qualified', 'disqualified', 'pending')
          THEN ${reviewDecisionExpression}
        WHEN ${alias}.eligibility_status = 'eligible'
          THEN 'qualified'
        WHEN ${alias}.eligibility_status = 'ineligible'
          THEN 'disqualified'
        WHEN ${alias}.eligibility_status = 'requires_review'
          THEN 'pending'
        ELSE 'not_reviewed'
      END
    `;
  }

  function buildLatestCwaLateralSelect(profileMapping) {
    return `
      LEFT JOIN LATERAL (
        SELECT
          ${
            profileMapping.cwaColumn
              ? `${profileMapping.cwaColumn} AS cwa_value,`
              : "NULL::numeric AS cwa_value,"
          }
          ${
            profileMapping.academicYearLabelColumn
              ? `${profileMapping.academicYearLabelColumn} AS academic_year_label,`
              : "NULL::text AS academic_year_label,"
          }
          ${
            profileMapping.semesterColumn
              ? `${profileMapping.semesterColumn} AS semester_label`
              : "NULL::text AS semester_label"
          }
        FROM academic_profiles
        WHERE student_id = student.id
          ${
            profileMapping.cwaColumn
              ? `AND ${profileMapping.cwaColumn} IS NOT NULL`
              : "AND FALSE"
          }
        ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
        LIMIT 1
      ) latest_cwa ON TRUE
    `;
  }

  function buildListWhereClause(filters = {}, params) {
    const conditions = [];

    if (filters.id) {
      params.push(filters.id);
      conditions.push(`a.id::text = $${params.length}`);
    }
    if (filters.studentId) {
      params.push(filters.studentId);
      conditions.push(`a.student_id::text = $${params.length}`);
    }
    if (filters.schemeId) {
      params.push(filters.schemeId);
      conditions.push(`a.scheme_id::text = $${params.length}`);
    }
    if (filters.cycleId) {
      params.push(filters.cycleId);
      conditions.push(`a.cycle_id::text = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (filters.studentReferenceId) {
      params.push(filters.studentReferenceId);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM student_identifiers filter_identifier
          WHERE filter_identifier.student_id = student.id
            AND filter_identifier.identifier_type = 'student_reference_id'
            AND filter_identifier.identifier_value = $${params.length}
        )
      `);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      conditions.push(`
        (
          student.full_name ILIKE $${params.length}
          OR scheme.name ILIKE $${params.length}
          OR EXISTS (
            SELECT 1
            FROM student_identifiers filter_any_identifier
            WHERE filter_any_identifier.student_id = student.id
              AND filter_any_identifier.identifier_value ILIKE $${params.length}
          )
        )
      `);
    }
    if (filters.qualificationStatus) {
      params.push(filters.qualificationStatus);
      conditions.push(`${buildQualificationStatusExpression("a")} = $${params.length}`);
    }

    if (String(filters.nameMismatchOnly || "").toLowerCase() === "true") {
      conditions.push(`
        a.reviewer_notes IS NOT NULL
        AND a.reviewer_notes ~ '^\\s*\\{'
        AND COALESCE((a.reviewer_notes::jsonb ->> 'nameMismatchFlag')::boolean, FALSE) = TRUE
      `);
    }

    return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  }

  async function list(filters = {}) {
    const profileMapping = await getAcademicProfileMapping();
    const params = [];
    const whereClause = buildListWhereClause(filters, params);
    const limitClause =
      filters.limit === undefined || filters.limit === null || filters.limit === ""
        ? ""
        : (() => {
            params.push(Number(filters.limit));
            return `LIMIT $${params.length}`;
          })();
    const result = await database.query(
      `
        SELECT
          a.id::text AS id,
          a.student_id::text AS student_id,
          student.full_name AS student_name,
          student.email,
          student.phone_number,
          identifier.identifier_value AS student_reference_id,
          identifier_index.identifier_value AS index_number,
          profile.college,
          profile.program_name,
          profile.year_value AS year_of_study,
          COALESCE(profile.cwa_value, latest_cwa.cwa_value) AS cwa,
          profile.wassce_aggregate_value AS wassce_aggregate,
          a.scheme_id::text AS scheme_id,
          scheme.name AS scheme_name,
          a.cycle_id::text AS cycle_id,
          cycle.label AS cycle_label,
          a.status,
          a.eligibility_status,
          a.need_category,
          a.need_score,
          recommendation.id::text AS recommendation_id,
          recommendation.status AS recommendation_status,
          recommendation.final_score,
          recommendation.recommended_amount,
          a.reviewer_notes,
          a.submitted_at
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        LEFT JOIN student_identifiers identifier
          ON identifier.student_id = student.id
          AND identifier.identifier_type = 'student_reference_id'
          AND identifier.is_primary = TRUE
        LEFT JOIN student_identifiers identifier_index
          ON identifier_index.student_id = student.id
          AND identifier_index.identifier_type = 'index_number'
        LEFT JOIN LATERAL (
          SELECT
            college,
            program_name,
            ${
              profileMapping.yearColumn
                ? `${profileMapping.yearColumn} AS year_value,`
                : "NULL::text AS year_value,"
            }
            ${
              profileMapping.cwaColumn
                ? `${profileMapping.cwaColumn} AS cwa_value,`
                : "NULL::numeric AS cwa_value,"
            }
            ${
              profileMapping.wassceAggregateColumn
                ? `${profileMapping.wassceAggregateColumn} AS wassce_aggregate_value`
                : "NULL::numeric AS wassce_aggregate_value"
            }
          FROM academic_profiles
          WHERE student_id = student.id
          ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
          LIMIT 1
        ) profile ON TRUE
        ${buildLatestCwaLateralSelect(profileMapping)}
        INNER JOIN schemes scheme ON scheme.id = a.scheme_id
        INNER JOIN application_cycles cycle ON cycle.id = a.cycle_id
        LEFT JOIN recommendations recommendation ON recommendation.application_id = a.id
        ${whereClause}
        ORDER BY a.created_at DESC
        ${limitClause}
      `,
      params
    );

    return result.rows.map(mapApplicationRow);
  }

  async function summary(filters = {}) {
    const params = [];
    const whereClause = buildListWhereClause(filters, params);
    const qualificationStatusExpression = buildQualificationStatusExpression("a");
    const result = await database.query(
      `
        SELECT
          COUNT(*)::int AS total_applications,
          COUNT(*) FILTER (WHERE ${qualificationStatusExpression} <> 'not_reviewed')::int AS reviewed_count,
          COUNT(*) FILTER (WHERE ${qualificationStatusExpression} = 'qualified')::int AS qualified_count,
          COUNT(*) FILTER (WHERE ${qualificationStatusExpression} = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE ${qualificationStatusExpression} = 'disqualified')::int AS disqualified_count,
          COUNT(*) FILTER (WHERE ${qualificationStatusExpression} = 'not_reviewed')::int AS not_reviewed_count
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        INNER JOIN schemes scheme ON scheme.id = a.scheme_id
        ${whereClause}
      `,
      params
    );

    const row = result.rows[0] || {};
    return {
      totalApplications: Number(row.total_applications || 0),
      reviewedCount: Number(row.reviewed_count || 0),
      qualifiedCount: Number(row.qualified_count || 0),
      pendingCount: Number(row.pending_count || 0),
      disqualifiedCount: Number(row.disqualified_count || 0),
      notReviewedCount: Number(row.not_reviewed_count || 0)
    };
  }

  async function cwaCoverage(filters = {}) {
    const profileMapping = await getAcademicProfileMapping();
    const params = [];
    const whereClause = buildListWhereClause(filters, params);
    const qualificationStatusExpression = buildQualificationStatusExpression("a");

    const summaryResult = await database.query(
      `
        SELECT
          COUNT(*)::int AS total_applications,
          COUNT(*) FILTER (WHERE latest_cwa.cwa_value IS NOT NULL)::int AS matched_cwa_count,
          COUNT(*) FILTER (WHERE latest_cwa.cwa_value IS NULL)::int AS missing_cwa_count
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        LEFT JOIN student_identifiers identifier
          ON identifier.student_id = student.id
          AND identifier.identifier_type = 'student_reference_id'
          AND identifier.is_primary = TRUE
        LEFT JOIN student_identifiers identifier_index
          ON identifier_index.student_id = student.id
          AND identifier_index.identifier_type = 'index_number'
        ${buildLatestCwaLateralSelect(profileMapping)}
        INNER JOIN schemes scheme ON scheme.id = a.scheme_id
        INNER JOIN application_cycles cycle ON cycle.id = a.cycle_id
        ${whereClause}
      `,
      params
    );

    const missingWhereClause = whereClause
      ? `${whereClause} AND latest_cwa.cwa_value IS NULL`
      : `WHERE latest_cwa.cwa_value IS NULL`;
    const missingResult = await database.query(
      `
        SELECT
          a.id::text AS id,
          a.student_id::text AS student_id,
          student.full_name AS student_name,
          identifier.identifier_value AS student_reference_id,
          identifier_index.identifier_value AS index_number,
          student_profile.college,
          student_profile.program_name,
          student_profile.year_value AS year_of_study,
          latest_cwa.cwa_value AS cwa,
          latest_cwa.academic_year_label AS cwa_academic_year_label,
          latest_cwa.semester_label AS cwa_semester_label,
          scheme.name AS scheme_name,
          cycle.label AS cycle_label,
          ${qualificationStatusExpression} AS qualification_status,
          recommendation.final_score
        FROM applications a
        INNER JOIN students student ON student.id = a.student_id
        LEFT JOIN student_identifiers identifier
          ON identifier.student_id = student.id
          AND identifier.identifier_type = 'student_reference_id'
          AND identifier.is_primary = TRUE
        LEFT JOIN student_identifiers identifier_index
          ON identifier_index.student_id = student.id
          AND identifier_index.identifier_type = 'index_number'
        LEFT JOIN LATERAL (
          SELECT
            college,
            program_name,
            ${
              profileMapping.yearColumn
                ? `${profileMapping.yearColumn} AS year_value`
                : "NULL::text AS year_value"
            }
          FROM academic_profiles
          WHERE student_id = student.id
          ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
          LIMIT 1
        ) student_profile ON TRUE
        ${buildLatestCwaLateralSelect(profileMapping)}
        INNER JOIN schemes scheme ON scheme.id = a.scheme_id
        INNER JOIN application_cycles cycle ON cycle.id = a.cycle_id
        LEFT JOIN recommendations recommendation ON recommendation.application_id = a.id
        ${missingWhereClause}
        ORDER BY recommendation.final_score DESC NULLS LAST, a.created_at DESC
        LIMIT ${CWA_COVERAGE_DISPLAY_LIMIT}
      `,
      params
    );

    const summaryRow = summaryResult.rows[0] || {};
    return {
      summary: {
        totalApplications: Number(summaryRow.total_applications || 0),
        matchedCwaCount: Number(summaryRow.matched_cwa_count || 0),
        missingCwaCount: Number(summaryRow.missing_cwa_count || 0),
        coveragePercentage: Number(summaryRow.total_applications || 0)
          ? Math.round(
              (Number(summaryRow.matched_cwa_count || 0) /
                Number(summaryRow.total_applications || 0)) *
                1000
            ) / 10
          : 0
      },
      missingItems: missingResult.rows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentReferenceId: row.student_reference_id,
        indexNumber: row.index_number,
        college: row.college,
        program: row.program_name,
        year: row.year_of_study,
        schemeName: row.scheme_name,
        cycleLabel: row.cycle_label,
        qualificationStatus: row.qualification_status,
        finalScore: row.final_score === null ? null : Number(row.final_score),
        cwa: row.cwa === null ? null : Number(row.cwa),
        matchedAcademicYearLabel: row.cwa_academic_year_label,
        matchedSemesterLabel: row.cwa_semester_label
      })),
      totalMissingItems: Number(summaryRow.missing_cwa_count || 0),
      returnedMissingItems: missingResult.rows.length,
      missingItemsTruncated:
        Number(summaryRow.missing_cwa_count || 0) > missingResult.rows.length
    };
  }

  return {
    list,
    summary,
    cwaCoverage,
    async getById(id) {
      const rows = await list({ id });
      return rows[0] || null;
    },
    async findExisting(studentId, schemeId, cycleId) {
      const rows = await list({ studentId, schemeId, cycleId });
      return rows[0] || null;
    },
    async findExistingForStudents(studentIds, schemeId, cycleId) {
      const profileMapping = await getAcademicProfileMapping();
      const uniqueIds = Array.from(new Set((studentIds || []).filter(Boolean)));
      if (!uniqueIds.length) {
        return new Map();
      }

      const result = await database.query(
        `
          SELECT
            a.id::text AS id,
            a.student_id::text AS student_id,
            student.full_name AS student_name,
            student.email,
            student.phone_number,
            identifier.identifier_value AS student_reference_id,
            identifier_index.identifier_value AS index_number,
            profile.college,
            profile.program_name,
            profile.year_value AS year_of_study,
            COALESCE(profile.cwa_value, latest_cwa.cwa_value) AS cwa,
            profile.wassce_aggregate_value AS wassce_aggregate,
            a.scheme_id::text AS scheme_id,
            scheme.name AS scheme_name,
            a.cycle_id::text AS cycle_id,
            cycle.label AS cycle_label,
            a.status,
            a.eligibility_status,
            a.need_category,
            a.need_score,
            recommendation.id::text AS recommendation_id,
            recommendation.status AS recommendation_status,
            recommendation.final_score,
            recommendation.recommended_amount,
            a.reviewer_notes,
            a.submitted_at
          FROM applications a
          INNER JOIN students student ON student.id = a.student_id
          LEFT JOIN student_identifiers identifier
            ON identifier.student_id = student.id
            AND identifier.identifier_type = 'student_reference_id'
            AND identifier.is_primary = TRUE
          LEFT JOIN student_identifiers identifier_index
            ON identifier_index.student_id = student.id
            AND identifier_index.identifier_type = 'index_number'
          LEFT JOIN LATERAL (
            SELECT
              college,
              program_name,
              ${
                profileMapping.yearColumn
                  ? `${profileMapping.yearColumn} AS year_value,`
                  : "NULL::text AS year_value,"
              }
              ${
                profileMapping.cwaColumn
                  ? `${profileMapping.cwaColumn} AS cwa_value,`
                  : "NULL::numeric AS cwa_value,"
              }
              ${
                profileMapping.wassceAggregateColumn
                  ? `${profileMapping.wassceAggregateColumn} AS wassce_aggregate_value`
                  : "NULL::numeric AS wassce_aggregate_value"
              }
            FROM academic_profiles
            WHERE student_id = student.id
            ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
            LIMIT 1
          ) profile ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              ${
                profileMapping.cwaColumn
                  ? `${profileMapping.cwaColumn} AS cwa_value`
                  : "NULL::numeric AS cwa_value"
              }
            FROM academic_profiles
            WHERE student_id = student.id
              ${
                profileMapping.cwaColumn
                  ? `AND ${profileMapping.cwaColumn} IS NOT NULL`
                  : "AND FALSE"
              }
            ORDER BY ${buildAcademicProfileOrderClause("academic_profiles", profileMapping)}
            LIMIT 1
          ) latest_cwa ON TRUE
          INNER JOIN schemes scheme ON scheme.id = a.scheme_id
          INNER JOIN application_cycles cycle ON cycle.id = a.cycle_id
          LEFT JOIN recommendations recommendation ON recommendation.application_id = a.id
          WHERE a.student_id::text = ANY($1::text[])
            AND a.scheme_id::text = $2
            AND a.cycle_id::text = $3
        `,
        [uniqueIds, schemeId, cycleId]
      );

      const items = result.rows.map(mapApplicationRow);
      return new Map(items.map((item) => [item.studentId, item]));
    },
    async create(input, actor) {
      const createdId = await database.withTransaction(async (transaction) => {
        const createdBy = toDatabaseUserId(actor);
        const result = await transaction.query(
          `
            INSERT INTO applications (
              student_id,
              scheme_id,
              cycle_id,
              submitted_at,
              status,
              eligibility_status,
              need_category,
              need_score,
              reviewer_notes,
              created_by
            )
            VALUES (
              NULLIF($1, '')::BIGINT,
              NULLIF($2, '')::BIGINT,
              NULLIF($3, '')::BIGINT,
              NOW(),
              $4,
              $5,
              $6,
              $7,
              $8,
              $9
            )
            RETURNING id::text AS id
          `,
          [
            input.studentId,
            input.schemeId,
            input.cycleId,
            input.status,
            input.eligibilityStatus,
            input.needCategory || null,
            input.needScore,
            serializeReviewerMetadata(input.reviewerMetadata ?? input.reviewerNotes ?? null),
            createdBy
          ]
        );

        const applicationId = result.rows[0].id;

        if (
          input.finalScore !== null ||
          input.recommendationStatus ||
          input.recommendedAmount !== null
        ) {
          await transaction.query(
            `
              INSERT INTO recommendations (
                application_id,
                final_score,
                status,
                recommended_amount,
                recommended_at
              )
              VALUES (
                NULLIF($1, '')::BIGINT,
                $2,
                $3,
                $4,
                NOW()
              )
            `,
            [
              applicationId,
              input.finalScore,
              input.recommendationStatus || "pending",
              input.recommendedAmount
            ]
          );
        }

        return applicationId;
      });

      const created = await list({ id: createdId });
      return created[0];
    },
    async updateReview(id, input) {
      const updatedId = await database.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `
            UPDATE applications
            SET
              status = $2,
              eligibility_status = $3,
              reviewer_notes = $4,
              updated_at = NOW()
            WHERE id::text = $1
            RETURNING id::text AS id
          `,
          [
            id,
            input.status,
            input.eligibilityStatus,
            serializeReviewerMetadata(input.reviewerMetadata)
          ]
        );

        return result.rows[0]?.id || null;
      });

      if (!updatedId) {
        return null;
      }

      const updated = await list({ id: updatedId });
      return updated[0] || null;
    },
    async bulkUpdateInterview(input) {
      const matchingApplications = await list({
        schemeId: input.schemeId,
        cycleId: input.cycleId
      });

      if (!matchingApplications.length) {
        return {
          updatedApplications: 0
        };
      }

      await database.withTransaction(async (transaction) => {
        for (const application of matchingApplications) {
          const reviewerMetadata = {
            noteText: application.reviewerNotes || null,
            uploadedFullName: application.uploadedFullName || null,
            uploadedStudentReferenceId: application.uploadedStudentReferenceId || null,
            applicantEmail: application.applicantEmail || null,
            uploadedProgram: application.uploadedProgram || null,
            documentChecklist: Array.isArray(application.documentChecklist)
              ? application.documentChecklist
              : [],
            nameMismatchFlag: Boolean(application.nameMismatchFlag),
            interviewStatus: input.interviewStatus,
            interviewScore: application.interviewScore ?? null,
            interviewDate: input.interviewDate || application.interviewDate || null,
            interviewNotes: input.interviewNotes || application.interviewNotes || null,
            reviewDecision: application.reviewDecision || null,
            reviewReason: application.reviewReason || null,
            reviewComment: application.reviewComment || null,
            outcomeDecision: application.outcomeDecision || null,
            outcomeAmount: application.outcomeAmount ?? null,
            outcomeNotes: application.outcomeNotes || null,
            outcomeUpdatedAt: application.outcomeUpdatedAt || null,
            outcomeUpdatedByUserId: application.outcomeUpdatedByUserId || null,
            outcomeUpdatedByName: application.outcomeUpdatedByName || null,
            reviewUpdatedAt: new Date().toISOString(),
            reviewedByUserId: input.reviewedByUserId || application.reviewedByUserId || null,
            reviewedByName: input.reviewedByName || application.reviewedByName || null
          };

          await transaction.query(
            `
              UPDATE applications
              SET
                reviewer_notes = $2,
                updated_at = NOW()
              WHERE id::text = $1
            `,
            [application.id, serializeReviewerMetadata(reviewerMetadata)]
          );
        }
      });

      return {
        updatedApplications: matchingApplications.length
      };
    },
    async bulkUpdateOutcomes(input) {
      const matchingApplications = await list({
        schemeId: input.schemeId,
        cycleId: input.cycleId,
        qualificationStatus: input.sourceQualificationStatus
      });

      if (!matchingApplications.length) {
        return {
          updatedApplications: 0
        };
      }

      await database.withTransaction(async (transaction) => {
        for (const application of matchingApplications) {
          const reviewerMetadata = {
            noteText: application.reviewerNotes || null,
            uploadedFullName: application.uploadedFullName || null,
            uploadedStudentReferenceId: application.uploadedStudentReferenceId || null,
            applicantEmail: application.applicantEmail || null,
            uploadedProgram: application.uploadedProgram || null,
            documentChecklist: Array.isArray(application.documentChecklist)
              ? application.documentChecklist
              : [],
            nameMismatchFlag: Boolean(application.nameMismatchFlag),
            interviewStatus: application.interviewStatus || null,
            interviewScore: application.interviewScore ?? null,
            interviewDate: application.interviewDate || null,
            interviewNotes: application.interviewNotes || null,
            reviewDecision: application.reviewDecision || null,
            reviewReason: application.reviewReason || null,
            reviewComment: application.reviewComment || null,
            outcomeDecision: input.outcomeDecision,
            outcomeAmount: input.outcomeAmount ?? null,
            outcomeNotes: input.outcomeNotes || application.outcomeNotes || null,
            outcomeUpdatedAt: new Date().toISOString(),
            outcomeUpdatedByUserId:
              input.outcomeUpdatedByUserId || application.outcomeUpdatedByUserId || null,
            outcomeUpdatedByName:
              input.outcomeUpdatedByName || application.outcomeUpdatedByName || null,
            reviewUpdatedAt: application.reviewUpdatedAt || null,
            reviewedByUserId: application.reviewedByUserId || null,
            reviewedByName: application.reviewedByName || null
          };

          await transaction.query(
            `
              UPDATE applications
              SET
                status = $2,
                reviewer_notes = $3,
                updated_at = NOW()
              WHERE id::text = $1
            `,
            [application.id, input.outcomeDecision, serializeReviewerMetadata(reviewerMetadata)]
          );
        }
      });

      return {
        updatedApplications: matchingApplications.length
      };
    },
    async listImportIssues(filters = {}) {
      await ensureIssueQueueSchema();

      const params = [];
      const conditions = [];
      if (filters.schemeId) {
        params.push(filters.schemeId);
        conditions.push(`issue.scheme_id = NULLIF($${params.length}, '')::BIGINT`);
      }
      if (filters.cycleId) {
        params.push(filters.cycleId);
        conditions.push(`issue.cycle_id = NULLIF($${params.length}, '')::BIGINT`);
      }
      if (filters.status) {
        params.push(filters.status);
        conditions.push(`issue.status = $${params.length}`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await database.query(
        `
          SELECT
            issue.id::text AS id,
            issue.scheme_id::text AS scheme_id,
            issue.cycle_id::text AS cycle_id,
            issue.source_type,
            issue.row_number,
            issue.student_reference_id,
            issue.full_name,
            issue.payload,
            issue.issues,
            issue.status,
            issue.resolution_notes,
            issue.linked_application_id::text AS linked_application_id,
            issue.resolved_by::text AS resolved_by_user_id,
            issue.resolved_by_name,
            issue.created_at,
            issue.updated_at,
            issue.resolved_at
          FROM application_import_issues issue
          ${whereClause}
          ORDER BY issue.updated_at DESC, issue.id DESC
        `,
        params
      );

      return result.rows.map((row) => ({
        id: row.id,
        schemeId: row.scheme_id,
        cycleId: row.cycle_id,
        sourceType: row.source_type,
        rowNumber: row.row_number,
        studentReferenceId: row.student_reference_id,
        fullName: row.full_name,
        payload: row.payload && typeof row.payload === "object" ? row.payload : {},
        issues: Array.isArray(row.issues) ? row.issues : [],
        status: row.status,
        resolutionNotes: row.resolution_notes || null,
        linkedApplicationId: row.linked_application_id || null,
        resolvedByUserId: row.resolved_by_user_id || null,
        resolvedByName: row.resolved_by_name || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at
      }));
    },
    async replaceImportIssues(input) {
      await ensureIssueQueueSchema();

      await database.withTransaction(async (transaction) => {
        await transaction.query(
          `
            DELETE FROM application_import_issues
            WHERE scheme_id = NULLIF($1, '')::BIGINT
              AND cycle_id = NULLIF($2, '')::BIGINT
              AND source_type = $3
              AND status = 'open'
          `,
          [input.schemeId, input.cycleId, input.sourceType || "application_import"]
        );

        for (const item of input.items || []) {
          await transaction.query(
            `
              INSERT INTO application_import_issues (
                scheme_id,
                cycle_id,
                source_type,
                row_number,
                student_reference_id,
                full_name,
                payload,
                issues,
                status
              )
              VALUES (
                NULLIF($1, '')::BIGINT,
                NULLIF($2, '')::BIGINT,
                $3,
                $4,
                $5,
                $6,
                $7::jsonb,
                $8::jsonb,
                'open'
              )
            `,
            [
              input.schemeId,
              input.cycleId,
              input.sourceType || "application_import",
              item.rowNumber || null,
              item.studentReferenceId || null,
              item.fullName || null,
              JSON.stringify(item.payload || {}),
              JSON.stringify(Array.isArray(item.issues) ? item.issues : [])
            ]
          );
        }
      });

      return this.listImportIssues({
        schemeId: input.schemeId,
        cycleId: input.cycleId,
        status: "open"
      });
    },
    async resolveImportIssue(issueId, payload = {}) {
      await ensureIssueQueueSchema();

      const result = await database.query(
        `
          UPDATE application_import_issues
          SET
            status = 'resolved',
            resolution_notes = $2,
            linked_application_id = NULLIF($3, '')::BIGINT,
            resolved_by = NULLIF($4, '')::BIGINT,
            resolved_by_name = $5,
            resolved_at = NOW(),
            updated_at = NOW()
          WHERE id = NULLIF($1, '')::BIGINT
          RETURNING id::text AS id
        `,
        [
          issueId,
          payload.resolutionNotes || null,
          payload.linkedApplicationId || "",
          normalizeDatabaseUserId(payload.resolvedByUserId) || "",
          payload.resolvedByName || null
        ]
      );

      const updatedId = result.rows[0]?.id || null;
      if (!updatedId) {
        return null;
      }

      const items = await this.listImportIssues({});
      return items.find((item) => String(item.id) === String(updatedId)) || null;
    },
    async listMessageBatches(filters = {}) {
      await ensureMessagingSchema();

      const params = [];
      const conditions = [];
      if (filters.schemeId) {
        params.push(filters.schemeId);
        conditions.push(`batch.scheme_id = NULLIF($${params.length}, '')::BIGINT`);
      }
      if (filters.cycleId) {
        params.push(filters.cycleId);
        conditions.push(`batch.cycle_id = NULLIF($${params.length}, '')::BIGINT`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await database.query(
        `
          SELECT
            batch.id::text AS id,
            batch.scheme_id::text AS scheme_id,
            scheme.name AS scheme_name,
            batch.cycle_id::text AS cycle_id,
            cycle.label AS cycle_label,
            batch.channel,
            batch.message_type,
            batch.sender_email,
            batch.subject_line,
              batch.body_template,
              batch.recipient_count,
              batch.status,
              batch.created_at,
              COALESCE(creator.full_name, batch.created_by_name) AS created_by_name,
              batch.created_by::text AS created_by_user_id,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                  'id', item.id::text,
                  'applicationId', item.application_id::text,
                    'studentId', item.student_id::text,
                    'recipientEmail', item.recipient_email,
                    'recipientPhone', item.recipient_phone,
                    'recipientName', item.recipient_name,
                    'deliveryStatus', item.delivery_status,
                    'errorMessage', item.error_message,
                    'providerMessageId', item.provider_message_id,
                    'createdAt', item.created_at,
                    'updatedAt', item.updated_at
                  )
                ORDER BY item.id
              ) FILTER (WHERE item.id IS NOT NULL),
              '[]'::json
            ) AS items
          FROM application_message_batches batch
          INNER JOIN schemes scheme ON scheme.id = batch.scheme_id
          INNER JOIN application_cycles cycle ON cycle.id = batch.cycle_id
          LEFT JOIN users creator ON creator.id = batch.created_by
          LEFT JOIN application_message_batch_items item ON item.batch_id = batch.id
          ${whereClause}
          GROUP BY
            batch.id,
            batch.scheme_id,
            scheme.name,
            batch.cycle_id,
            cycle.label,
            batch.channel,
            batch.message_type,
            batch.sender_email,
            batch.subject_line,
            batch.body_template,
              batch.recipient_count,
              batch.status,
              batch.created_at,
              COALESCE(creator.full_name, batch.created_by_name),
              batch.created_by
            ORDER BY batch.created_at DESC, batch.id DESC
          `,
          params
        );

      return result.rows.map((row) => ({
        id: row.id,
        schemeId: row.scheme_id,
        schemeName: row.scheme_name,
        cycleId: row.cycle_id,
        cycleLabel: row.cycle_label,
        channel: row.channel || "email",
        messageType: row.message_type,
        senderEmail: row.sender_email,
        subjectLine: row.subject_line,
        bodyTemplate: row.body_template,
        recipientCount: Number(row.recipient_count || 0),
        status: row.status,
        createdAt: row.created_at,
        createdByName: row.created_by_name || null,
        createdByUserId: row.created_by_user_id || null,
        items: Array.isArray(row.items) ? row.items : []
      }));
    },
    async createMessageBatch(input) {
      await ensureMessagingSchema();
      const createdByUserId = normalizeDatabaseUserId(input.createdByUserId);

      const createdId = await database.withTransaction(async (transaction) => {
        const batchResult = await transaction.query(
          `
            INSERT INTO application_message_batches (
              scheme_id,
              cycle_id,
              channel,
              message_type,
              sender_email,
              subject_line,
              body_template,
              recipient_count,
              status,
              created_by,
              created_by_name
            )
            VALUES (
              NULLIF($1, '')::BIGINT,
              NULLIF($2, '')::BIGINT,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              NULLIF($10, '')::BIGINT,
              $11
            )
            RETURNING id::text AS id
          `,
          [
            input.schemeId,
            input.cycleId,
            input.channel || "email",
            input.messageType,
            input.senderEmail,
            input.subjectLine,
            input.bodyTemplate,
            Array.isArray(input.items) ? input.items.length : 0,
            input.status || "logged",
            createdByUserId,
            input.createdByName || null
          ]
        );

        const batchId = batchResult.rows[0]?.id;
        for (const item of input.items || []) {
          await transaction.query(
            `
              INSERT INTO application_message_batch_items (
                batch_id,
                application_id,
                student_id,
                recipient_email,
                recipient_phone,
                recipient_name,
                delivery_status,
                error_message,
                provider_message_id
              )
              VALUES (
                NULLIF($1, '')::BIGINT,
                NULLIF($2, '')::BIGINT,
                NULLIF($3, '')::BIGINT,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9
              )
            `,
            [
              batchId,
              item.applicationId || null,
              item.studentId || null,
              item.recipientEmail || null,
              item.recipientPhone || null,
              item.recipientName || null,
              item.deliveryStatus || "logged",
              item.errorMessage || null,
              item.providerMessageId || null
            ]
          );
        }

        return batchId;
      });

      const items = await this.listMessageBatches({
        schemeId: input.schemeId,
        cycleId: input.cycleId
      });
      return items.find((item) => item.id === createdId) || null;
    },
    async updateMessageBatchDelivery(batchId, payload) {
      await ensureMessagingSchema();

      await database.withTransaction(async (transaction) => {
        await transaction.query(
          `
            UPDATE application_message_batches
            SET status = $2
            WHERE id = NULLIF($1, '')::BIGINT
          `,
          [batchId, payload.status || "logged"]
        );

        for (const item of payload.items || []) {
          await transaction.query(
            `
              UPDATE application_message_batch_items
              SET
                delivery_status = $2,
                error_message = $3,
                provider_message_id = $4,
                updated_at = NOW()
              WHERE id = NULLIF($1, '')::BIGINT
            `,
            [
              item.id,
              item.deliveryStatus || "logged",
              item.errorMessage ?? null,
              item.providerMessageId ?? null
            ]
          );
        }
      });

      const result = await database.query(
        `
          SELECT batch.scheme_id::text AS scheme_id, batch.cycle_id::text AS cycle_id
          FROM application_message_batches batch
          WHERE batch.id = NULLIF($1, '')::BIGINT
        `,
        [batchId]
      );

      const schemeId = result.rows[0]?.scheme_id || "";
      const cycleId = result.rows[0]?.cycle_id || "";
      const items = await this.listMessageBatches({ schemeId, cycleId });
      return items.find((item) => String(item.id) === String(batchId)) || null;
    }
  };
}

export function createApplicationRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
