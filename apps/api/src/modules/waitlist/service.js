import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { buildRecommendedImportPreview } from "./import.js";

function assertRequiredString(value, label) {
  if (!String(value || "").trim()) {
    throw new ValidationError(`${label} is required.`);
  }
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function normalizeRecommendedStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "waitlisted") return "awaiting_support";
  if (text === "promoted") return "supported";
  if (text === "supported") return "supported";
  return "awaiting_support";
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "internal" || text === "external") return text;
  return "unknown";
}

function normalizeBeneficiaryCohort(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "not applicable" || text === "not_applicable" || text === "none") {
    return null;
  }
  if (text.includes("current")) return "current";
  if (text.includes("new")) return "new";
  return null;
}

function summarizeRecords(items = []) {
  return {
    total: items.length,
    awaitingSupport: items.filter((item) => item.status === "awaiting_support").length,
    supported: items.filter((item) => item.status === "supported").length,
    linkedApplications: items.filter((item) => item.linkedApplicationId).length,
    linkedBeneficiaries: items.filter((item) => item.linkedBeneficiaryId).length
  };
}

async function hydrateRecordFromRegistry(repositories, item) {
  if (!item?.studentId) {
    return item;
  }

  const needsFallback = !item.fullName || !item.studentReferenceId || !item.program || !item.year;
  if (!needsFallback) {
    return item;
  }

  const student = await repositories.students.getById(item.studentId);
  if (!student) {
    return item;
  }

  return {
    ...item,
    fullName: item.fullName || student.fullName || null,
    studentReferenceId: item.studentReferenceId || student.studentReferenceId || null,
    indexNumber: item.indexNumber || student.indexNumber || null,
    email: item.email || student.email || null,
    college: item.college || student.college || null,
    program: item.program || student.program || null,
    year: item.year || student.year || null
  };
}

async function resolveStudentMatch(repositories, payload = {}) {
  const identifiers = {
    studentReferenceId: String(payload.studentReferenceId || "").trim(),
    indexNumber: String(payload.indexNumber || "").trim()
  };
  if (!identifiers.studentReferenceId && !identifiers.indexNumber) {
    throw new ValidationError("Student ID / Reference Number is required.");
  }

  const matches = await repositories.students.findByIdentifiers(identifiers);
  if (!matches.length) {
    throw new ValidationError(
      "The student could not be matched in the registry with the provided student ID / reference number."
    );
  }
  if (matches.length > 1) {
    throw new ValidationError(
      "The provided student ID / reference number matched multiple students in the registry."
    );
  }

  return matches[0];
}

async function resolveSchemeContext(repositories, payload = {}) {
  const schemes = await repositories.schemes.list();
  const cycles = await repositories.cycles.list();
  const schemeId = String(payload.schemeId || "").trim();
  const cycleId = String(payload.cycleId || "").trim();
  const schemeName = String(payload.schemeName || "").trim();
  const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel || payload.cycleLabel);

  if (schemeId) {
    const scheme = schemes.find((item) => String(item.id) === schemeId);
    if (!scheme) {
      throw new NotFoundError("The selected scheme was not found.");
    }
    const cycle =
      cycles.find((item) => String(item.id) === String(cycleId || scheme.cycleId || "")) || null;
    if (!cycle) {
      throw new NotFoundError("The selected academic year was not found.");
    }
    return {
      schemeId: String(scheme.id),
      schemeName: scheme.name,
      cycleId: String(cycle.id),
      cycleLabel: cycle.label || cycle.academicYearLabel || scheme.academicYearLabel || ""
    };
  }

  if (!schemeName) {
    throw new ValidationError("Scheme name is required.");
  }
  if (!academicYearLabel) {
    throw new ValidationError("Academic year is required.");
  }

  const matchedScheme = schemes.find((item) => {
    const itemYear = normalizeAcademicYearLabel(item.academicYearLabel || item.cycleLabel);
    return (
      String(item.name || "").trim().toLowerCase() === schemeName.toLowerCase() &&
      itemYear === academicYearLabel
    );
  });

  if (!matchedScheme) {
    throw new ValidationError(
      "The scheme name could not be matched to an available scheme in the selected academic year."
    );
  }

  const cycle =
    cycles.find((item) => String(item.id) === String(matchedScheme.cycleId || "")) ||
    cycles.find(
      (item) =>
        normalizeAcademicYearLabel(item.label || item.academicYearLabel) === academicYearLabel
    );

  if (!cycle) {
    throw new NotFoundError("The selected academic year was not found.");
  }

  return {
    schemeId: String(matchedScheme.id),
    schemeName: matchedScheme.name,
    cycleId: String(cycle.id),
    cycleLabel: cycle.label || cycle.academicYearLabel || academicYearLabel
  };
}

async function buildStudentBatchLookup(repositories, rows = []) {
  const studentReferenceIds = Array.from(
    new Set(rows.map((row) => String(row.studentReferenceId || "").trim()).filter(Boolean))
  );
  const indexNumbers = Array.from(
    new Set(rows.map((row) => String(row.indexNumber || "").trim()).filter(Boolean))
  );

  if (typeof repositories.students.findExistingByIdentifierBatch === "function") {
    return repositories.students.findExistingByIdentifierBatch({
      studentReferenceIds,
      indexNumbers
    });
  }

  const byReferenceId = new Map();
  const byIndexNumber = new Map();
  for (const studentReferenceId of studentReferenceIds) {
    byReferenceId.set(
      studentReferenceId,
      await repositories.students.findByIdentifiers({ studentReferenceId })
    );
  }
  for (const indexNumber of indexNumbers) {
    byIndexNumber.set(indexNumber, await repositories.students.findByIdentifiers({ indexNumber }));
  }
  return { byReferenceId, byIndexNumber };
}

function resolveMatchedStudent(studentLookup, payload = {}) {
  const studentReferenceId = String(payload.studentReferenceId || "").trim();
  const indexNumber = String(payload.indexNumber || "").trim();
  const referenceMatches = studentReferenceId
    ? studentLookup.byReferenceId?.get?.(studentReferenceId) || []
    : [];
  const indexMatches = indexNumber ? studentLookup.byIndexNumber?.get?.(indexNumber) || [] : [];

  if (referenceMatches.length > 1 || indexMatches.length > 1) {
    return {
      issues: [
        "The row matched multiple students in the registry. Please correct the student identifier before import."
      ],
      student: null
    };
  }

  const student = referenceMatches[0] || indexMatches[0] || null;
  if (!student) {
    return {
      issues: [
        "The row could not match any student in the registry. Only existing registry students can be recommended."
      ],
      student: null
    };
  }

  return {
    issues: [],
    student
  };
}

function buildSchemeLookup(repositoriesResult = [], cycles = []) {
  const byId = new Map();
  const byNameAndYear = new Map();
  for (const scheme of repositoriesResult || []) {
    const schemeId = String(scheme.id || "").trim();
    if (schemeId) {
      byId.set(schemeId, scheme);
    }
    const cycle =
      cycles.find((item) => String(item.id) === String(scheme.cycleId || "")) || null;
    const academicYearLabel = normalizeAcademicYearLabel(
      scheme.academicYearLabel || cycle?.label || cycle?.academicYearLabel
    );
    const key = [
      String(scheme.name || "").trim().toLowerCase(),
      academicYearLabel.toLowerCase()
    ].join("::");
    byNameAndYear.set(key, {
      scheme,
      cycle
    });
  }
  return { byId, byNameAndYear };
}

function resolveMatchedScheme(schemeLookup, payload = {}) {
  const schemeName = String(payload.schemeName || "").trim();
  const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
  if (!schemeName) {
    return { issues: ["Scheme name is required."], scheme: null, cycle: null };
  }
  if (!academicYearLabel) {
    return { issues: ["Academic year is required."], scheme: null, cycle: null };
  }

  const key = [schemeName.toLowerCase(), academicYearLabel.toLowerCase()].join("::");
  const match = schemeLookup.byNameAndYear.get(key);
  if (!match) {
    return {
      issues: [
        "The scheme name could not be matched to an available scheme in the selected academic year."
      ],
      scheme: null,
      cycle: null
    };
  }

  return {
    issues: [],
    scheme: match.scheme,
    cycle: match.cycle
  };
}

async function buildImportAssessment(repositories, payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) {
    throw new ValidationError("Upload a recommended-students file before generating a preview.");
  }

  const schemes = (await repositories.schemes.list()).filter(
    (item) => String(item.status || "").toLowerCase() === "active"
  );
  const cycles = await repositories.cycles.list();
  const studentLookup = await buildStudentBatchLookup(
    repositories,
    buildRecommendedImportPreview(rows).rows.map((row) => row.payload)
  );
  const schemeLookup = buildSchemeLookup(schemes, cycles);
  const previewSeed = buildRecommendedImportPreview(rows);
  const enrichedRows = [];

  for (const row of previewSeed.rows) {
    const issues = [...(row.issues || [])];
    const warnings = [...(row.warnings || [])];
    const payloadRow = { ...row.payload };

    const studentResult = resolveMatchedStudent(studentLookup, payloadRow);
    issues.push(...studentResult.issues);
    if (studentResult.student) {
      payloadRow.studentId = studentResult.student.id;
      payloadRow.fullName = payloadRow.fullName || studentResult.student.fullName || null;
      payloadRow.email = studentResult.student.email || null;
      payloadRow.college = studentResult.student.college || payloadRow.college || null;
      payloadRow.program = studentResult.student.program || null;
      payloadRow.year = studentResult.student.year || null;
    }

    const schemeResult = resolveMatchedScheme(schemeLookup, payloadRow);
    issues.push(...schemeResult.issues);
    if (schemeResult.scheme && schemeResult.cycle) {
      payloadRow.schemeId = String(schemeResult.scheme.id);
      payloadRow.schemeName = schemeResult.scheme.name;
      payloadRow.cycleId = String(schemeResult.cycle.id);
      payloadRow.cycleLabel =
        schemeResult.cycle.label ||
        schemeResult.cycle.academicYearLabel ||
        payloadRow.academicYearLabel;
      payloadRow.academicYearLabel = normalizeAcademicYearLabel(payloadRow.academicYearLabel);
    }

    if (!issues.length && payloadRow.studentId && payloadRow.schemeId && payloadRow.cycleId) {
      const existing = await repositories.waitlist.findExisting(
        payloadRow.studentId,
        payloadRow.schemeId,
        payloadRow.cycleId
      );
      if (existing) {
        issues.push(
          "A recommended-student record already exists for this student under the same scheme and academic year."
        );
      }
    }

    if (!payloadRow.recommendationReason) {
      warnings.push("Recommendation reason is blank. You can still import and add notes later.");
    }

    enrichedRows.push({
      ...row,
      status: issues.length ? "invalid" : "valid",
      payload: payloadRow,
      issues,
      warnings
    });
  }

  return {
    rows: enrichedRows,
    summary: {
      totalRows: enrichedRows.length,
      validRows: enrichedRows.filter((row) => row.status === "valid").length,
      invalidRows: enrichedRows.filter((row) => row.status !== "valid").length
    }
  };
}

export function createWaitlistService({ repositories, services }) {
  return {
    async list(filters = {}) {
      const rawItems = await repositories.waitlist.list({
        schemeId: String(filters.schemeId || "").trim(),
        cycleId: String(filters.cycleId || "").trim(),
        status: normalizeRecommendedStatus(filters.status),
        q: String(filters.q || "").trim()
      });
      const items = await Promise.all(
        (rawItems || []).map((item) => hydrateRecordFromRegistry(repositories, item))
      );
      const filterOptions = await repositories.waitlist.listFilterOptions();

      return {
        total: items.length,
        items,
        summary: summarizeRecords(items),
        filterOptions
      };
    },

    async create(payload, actor) {
      const student = await resolveStudentMatch(repositories, payload);
      const context = await resolveSchemeContext(repositories, payload);
      const existing = await repositories.waitlist.findExisting(
        student.id,
        context.schemeId,
        context.cycleId
      );
      if (existing) {
        throw new ConflictError(
          "This student is already recorded as recommended for the selected scheme and academic year."
        );
      }

      const item = await repositories.waitlist.create(
        {
          studentId: student.id,
          studentReferenceId: student.studentReferenceId || String(payload.studentReferenceId || "").trim(),
          indexNumber: student.indexNumber || String(payload.indexNumber || "").trim() || null,
          fullName: student.fullName,
          email: student.email || null,
          college: student.college || null,
          program: student.program || null,
          year: student.year || null,
          schemeId: context.schemeId,
          schemeName: context.schemeName,
          cycleId: context.cycleId,
          cycleLabel: context.cycleLabel,
          recommendationReason: String(payload.recommendationReason || "").trim() || null,
          notes: String(payload.notes || "").trim() || null,
          sourceType: "manual_add",
          status: "awaiting_support"
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.created",
        entityType: "recommended_student",
        entityId: item.id,
        summary: "Recommended student record was created.",
        metadata: {
          studentId: item.studentId,
          schemeId: item.schemeId,
          cycleId: item.cycleId
        }
      });
      return item;
    },

    async update(entryId, payload, actor) {
      const existing = await repositories.waitlist.getById(entryId);
      if (!existing) {
        throw new NotFoundError("Recommended student record was not found.");
      }
      if (existing.linkedApplicationId || existing.linkedBeneficiaryId || existing.status === "supported") {
        throw new ConflictError(
          "This recommended student has already been handed off and can no longer be edited."
        );
      }

      const student = await resolveStudentMatch(repositories, payload);
      const context = await resolveSchemeContext(repositories, payload);
      const conflict = await repositories.waitlist.findExisting(
        student.id,
        context.schemeId,
        context.cycleId
      );
      if (conflict && String(conflict.id) !== String(entryId)) {
        throw new ConflictError(
          "This student is already recorded as recommended for the selected scheme and academic year."
        );
      }

      const item = await repositories.waitlist.update(
        entryId,
        {
          studentId: student.id,
          studentReferenceId:
            student.studentReferenceId || String(payload.studentReferenceId || "").trim(),
          indexNumber: student.indexNumber || String(payload.indexNumber || "").trim() || null,
          fullName: student.fullName,
          email: student.email || null,
          college: student.college || null,
          program: student.program || null,
          year: student.year || null,
          schemeId: context.schemeId,
          schemeName: context.schemeName,
          cycleId: context.cycleId,
          cycleLabel: context.cycleLabel,
          recommendationReason: String(payload.recommendationReason || "").trim() || null,
          notes: String(payload.notes || "").trim() || null
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.updated",
        entityType: "recommended_student",
        entityId: item.id,
        summary: "Recommended student record was updated.",
        metadata: {
          studentId: item.studentId,
          schemeId: item.schemeId,
          cycleId: item.cycleId
        }
      });
      return item;
    },

    async remove(entryId, actor) {
      const existing = await repositories.waitlist.getById(entryId);
      if (!existing) {
        throw new NotFoundError("Recommended student record was not found.");
      }
      if (existing.linkedApplicationId || existing.linkedBeneficiaryId || existing.status === "supported") {
        throw new ConflictError(
          "This recommended student has already been handed off and cannot be removed."
        );
      }

      await repositories.waitlist.remove(entryId, actor);
      return { removedId: String(entryId) };
    },

    async previewImport(payload) {
      return buildImportAssessment(repositories, payload);
    },

    async importRows(payload, actor) {
      const assessment = await buildImportAssessment(repositories, payload);
      const validRows = assessment.rows.filter((row) => row.status === "valid");
      const imported = await repositories.waitlist.importRows(
        {
          items: validRows.map((row) => ({
            ...row.payload,
            status: "awaiting_support",
            sourceType: "import"
          })),
          sourceFileName: payload.fileName || "recommended-students-import.xlsx"
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.imported",
        entityType: "recommended_student_import",
        entityId: imported.batchReference || payload.fileName || "recommended-import",
        summary: "Recommended students import completed.",
        metadata: {
          totalRows: assessment.summary.totalRows,
          importedRows: imported.items.length
        }
      });

      return {
        batchReference: imported.batchReference,
        items: imported.items,
        rejectedRows: assessment.rows
          .filter((row) => row.status !== "valid")
          .map((row) => ({
            rowNumber: row.rowNumber,
            fullName: row.payload.fullName,
            studentReferenceId: row.payload.studentReferenceId,
            issues: row.issues
          })),
        summary: {
          ...assessment.summary,
          importedRows: imported.items.length
        },
        rows: assessment.rows
      };
    },

    async handoffToApplication(entryId, actor) {
      const entry = await repositories.waitlist.getById(entryId);
      if (!entry) {
        throw new NotFoundError("Recommended student record was not found.");
      }
      if (entry.linkedApplicationId) {
        throw new ConflictError("This recommended student has already been added to Applications.");
      }

      const existing = await repositories.applications.findExisting(
        entry.studentId,
        entry.schemeId,
        entry.cycleId
      );
      if (existing) {
        throw new ConflictError(
          "This student already exists in the application list for the same scheme and academic year.",
          { application: existing }
        );
      }

      const application = await services.applications.create(
        {
          studentId: entry.studentId,
          schemeId: entry.schemeId,
          cycleId: entry.cycleId,
          status: "submitted",
          eligibilityStatus: "eligible",
          reviewDecision: "qualified",
          reviewReason: "Recommended student intake",
          reviewComment: entry.recommendationReason || entry.notes || "Added from Recommended Students.",
          recommendationStatus: "recommended_student",
          uploadedFullName: entry.fullName,
          uploadedStudentReferenceId: entry.studentReferenceId,
          applicantEmail: entry.email || null,
          uploadedProgram: entry.program || null
        },
        actor
      );

      const record = await repositories.waitlist.linkApplication(
        {
          id: entryId,
          applicationId: application.id
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.handoff_to_application",
        entityType: "recommended_student",
        entityId: record?.id || String(entryId),
        summary: "Recommended student was handed off to applications.",
        metadata: {
          applicationId: application.id,
          studentId: entry.studentId,
          schemeId: entry.schemeId,
          cycleId: entry.cycleId
        }
      });

      return {
        record,
        application
      };
    },

    async handoffToBeneficiary(entryId, payload, actor) {
      const entry = await repositories.waitlist.getById(entryId);
      if (!entry) {
        throw new NotFoundError("Recommended student record was not found.");
      }
      if (entry.linkedBeneficiaryId || entry.status === "supported") {
        throw new ConflictError(
          "This recommended student has already been added into Beneficiaries & Support."
        );
      }

      const amountPaid = Number(payload.amountPaid);
      if (Number.isNaN(amountPaid) || amountPaid <= 0) {
        throw new ValidationError("A positive amount paid is required before adding support.");
      }

      const supportType = normalizeSupportType(payload.supportType);
      if (supportType === "unknown") {
        throw new ValidationError("Choose whether the support is internal or external.");
      }

      const duplicateKeys = await repositories.beneficiaries.findExistingDuplicateKeys([
        {
          academicYearLabel: entry.cycleLabel,
          schemeName: entry.schemeName,
          studentReferenceId: entry.studentReferenceId
        }
      ]);
      if (duplicateKeys.size) {
        throw new ConflictError(
          "A beneficiary/support record already exists for this student under the same scheme and academic year."
        );
      }

      const beneficiaryImport = await repositories.beneficiaries.importRows({
        items: [
          {
            academicYearLabel: entry.cycleLabel,
            schemeName: entry.schemeName,
            sponsorName: String(payload.sponsorName || "").trim() || null,
            fullName: entry.fullName,
            studentReferenceId: entry.studentReferenceId,
            indexNumber: entry.indexNumber || null,
            college: entry.college || null,
            amountPaid,
            currency: String(payload.currency || "GHS").trim() || "GHS",
            supportType,
            beneficiaryCohort: normalizeBeneficiaryCohort(payload.beneficiaryCohort),
            remarks:
              String(payload.remarks || "").trim() ||
              entry.notes ||
              entry.recommendationReason ||
              null,
            importMode: "current_cycle_linked",
            linkedApplicationId: entry.linkedApplicationId || null,
            linkedRecommendationId: entry.id
          }
        ],
        importMode: "current_cycle_linked",
        sourceFileName: payload.sourceFileName || "recommended-student-handoff",
        actor,
        duplicateStrategy: "skip"
      });

      const beneficiary = beneficiaryImport.items[0] || null;
      const record = await repositories.waitlist.markSupported(
        {
          id: entryId,
          beneficiaryId: beneficiary?.id || null
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.handoff_to_beneficiary",
        entityType: "recommended_student",
        entityId: record?.id || String(entryId),
        summary: "Recommended student was handed off to beneficiaries.",
        metadata: {
          beneficiaryId: beneficiary?.id || null,
          studentId: entry.studentId,
          schemeId: entry.schemeId,
          cycleId: entry.cycleId
        }
      });

      return {
        record,
        beneficiary
      };
    },

    async promote(entryId, payload, actor) {
      const result = await this.handoffToBeneficiary(entryId, payload, actor);
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "recommended_student.promoted",
        entityType: "recommended_student",
        entityId: result.record?.id || String(entryId),
        summary: "Recommended student was promoted into active support.",
        metadata: {
          beneficiaryId: result.beneficiary?.id || null
        }
      });
      return result;
    }
  };
}
