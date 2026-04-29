import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { createId } from "../../lib/ids.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { buildStudentImportPreview } from "./import.js";

const PREVIEW_DISPLAY_LIMIT = 160;
const IMPORT_RESULT_DISPLAY_LIMIT = 60;
const STUDENT_IMPORT_BATCH_SIZE = 1000;

function assertRequiredString(value, field, label) {
  if (!String(value || "").trim()) {
    throw new ValidationError(`${label} is required.`, { field });
  }
}

function normalizeNumber(value, field, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`${label} must be a valid number.`, { field });
  }

  return parsed;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) {
    throw new ValidationError("Email address is required.", { field: "email" });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
  if (!emailPattern.test(email)) {
    throw new ValidationError("Email address must be valid.", { field: "email" });
  }

  return email;
}

function normalizeImportMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "skip_existing") {
    return "skip_existing";
  }

  return "strict_new_only";
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function collapseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function hasNameMismatch(left, right) {
  const leftValue = collapseName(left);
  const rightValue = collapseName(right);
  return Boolean(leftValue && rightValue && leftValue !== rightValue);
}

export function createStudentService({ repositories }) {
  function limitRowsByStatus(rows, limits = {}) {
    const validLimit = limits.validLimit ?? PREVIEW_DISPLAY_LIMIT / 2;
    const invalidLimit = limits.invalidLimit ?? PREVIEW_DISPLAY_LIMIT / 2;
    const selected = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const row of rows) {
      if (row.status === "valid" && validCount < validLimit) {
        selected.push(row);
        validCount += 1;
        continue;
      }

      if (row.status === "invalid" && invalidCount < invalidLimit) {
        selected.push(row);
        invalidCount += 1;
      }
    }

    return selected;
  }

  function getExistingMatches(existingLookup, payload) {
    const matches = new Map();

    if (payload.studentReferenceId) {
      for (const item of existingLookup.byReferenceId.get(payload.studentReferenceId) || []) {
        matches.set(item.id, item);
      }
    }

    if (payload.indexNumber) {
      for (const item of existingLookup.byIndexNumber.get(payload.indexNumber) || []) {
        matches.set(item.id, item);
      }
    }

    return Array.from(matches.values());
  }

  function buildPreviewResponse(preview) {
    const rows = limitRowsByStatus(preview.rows);

    return {
      summary: preview.summary,
      rows,
      returnedRows: rows.length,
      truncated: rows.length < preview.rows.length,
      fileDuplicates: preview.fileDuplicates.slice(0, 50),
      existingMatchCount: preview.rows.filter((row) => row.existingMatches?.length).length,
      duplicateCases: preview.duplicateCases || []
    };
  }

  function parseBooleanFilter(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (["true", "1", "yes"].includes(normalized)) return "true";
    if (["false", "0", "no"].includes(normalized)) return "false";
    return "";
  }

  function buildAcademicHistoryPreviewResponse(preview) {
    const rows = limitRowsByStatus(preview.rows, {
      validLimit: PREVIEW_DISPLAY_LIMIT / 2,
      invalidLimit: PREVIEW_DISPLAY_LIMIT / 2
    });

    return {
      summary: preview.summary,
      rows,
      returnedRows: rows.length,
      truncated: rows.length < preview.rows.length
    };
  }

  async function resolveCycleIdForAcademicYearLabel(academicYearLabel) {
    const label = normalizeText(academicYearLabel);
    if (!label || !repositories.cycles?.list) {
      return null;
    }

    const cycles = await repositories.cycles.list();
    const matched = cycles.find(
      (item) =>
        item.academicYearLabel === label ||
        item.label === label ||
        String(item.label || "").startsWith(label)
    );

    return matched?.id || null;
  }

  async function getRegistryStats() {
    return {
      existingRegistryStudents: repositories.students.countAll
        ? await repositories.students.countAll()
        : 0,
      existingAcademicHistoryRecords: repositories.students.countAcademicHistory
        ? await repositories.students.countAcademicHistory()
        : 0
    };
  }

  async function assessAcademicHistoryPreview(payload) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const previewRows = rows.map((rawRow, index) => {
      const issues = [];
      const indexNumber =
        normalizeText(rawRow.indexNumber) ||
        normalizeText(rawRow["Index Number"]) ||
        null;
      const fullName =
        normalizeText(rawRow.fullName) ||
        normalizeText(rawRow["Full Name"]) ||
        normalizeText(rawRow.Name) ||
        null;
      const academicYearLabel =
        normalizeText(rawRow.academicYearLabel) ||
        normalizeText(rawRow["Academic Year"]) ||
        normalizeText(payload.academicYearLabel) ||
        null;
      const semesterLabel =
        normalizeText(rawRow.semesterLabel) ||
        normalizeText(rawRow["Semester Label"]) ||
        normalizeText(payload.semesterLabel) ||
        "Final Results";
      const cwaRaw = rawRow.cwa ?? rawRow.CWA ?? null;
      let cwa = null;

      if (!indexNumber) {
        issues.push("Index number is required.");
      }
      if (cwaRaw === undefined || cwaRaw === null || String(cwaRaw).trim() === "") {
        issues.push("CWA is required.");
      } else {
        try {
          cwa = normalizeNumber(cwaRaw, "cwa", "CWA");
        } catch {
          issues.push("CWA must be a valid number.");
        }
      }
      if (!academicYearLabel) {
        issues.push("Academic year could not be detected from this row.");
      }

      return {
        rowNumber: index + 1,
        status: issues.length ? "invalid" : "valid",
        issues,
        warnings: [],
        payload: {
          indexNumber,
          fullName,
          academicYearLabel,
          semesterLabel,
          cwa,
          college: normalizeText(rawRow.college || rawRow.College) || null,
          program:
            normalizeText(rawRow.program) ||
            normalizeText(rawRow["Programme of Study"]) ||
            null,
          year: normalizeText(rawRow.year || rawRow.Year) || null,
          notes: normalizeText(rawRow.notes || rawRow.Notes) || null
        }
      };
    });

    const lookup = await repositories.students.findExistingByIdentifierBatch({
      studentReferenceIds: [],
      indexNumbers: previewRows
        .filter((row) => row.status === "valid")
        .map((row) => row.payload.indexNumber)
        .filter(Boolean)
    });

    const assessedRows = previewRows.map((row) => {
      if (row.status !== "valid") {
        return {
          ...row,
          matchedStudent: null
        };
      }

      const matches = lookup.byIndexNumber.get(row.payload.indexNumber) || [];
      const warnings = [...row.warnings];
      const issues = [...row.issues];

      if (!matches.length) {
        issues.push("No registry student matched this index number.");
      } else if (matches.length > 1) {
        issues.push("This index number matched more than one registry student.");
      }

      const matchedStudent = matches.length === 1 ? matches[0] : null;
      if (matchedStudent && hasNameMismatch(row.payload.fullName, matchedStudent.fullName)) {
        warnings.push("Possible name mismatch between the CWA row and the registry record.");
      }

      return {
        ...row,
        status: issues.length ? "invalid" : "valid",
        issues,
        warnings,
        matchedStudent
      };
    });

    const registryStats = await getRegistryStats();

    return {
      summary: {
        totalRows: assessedRows.length,
        validRows: assessedRows.filter((row) => row.status === "valid").length,
        invalidRows: assessedRows.filter((row) => row.status === "invalid").length,
        matchedRows: assessedRows.filter((row) => row.matchedStudent).length,
        unmatchedRows: assessedRows.filter((row) => !row.matchedStudent).length,
        missingCwaRows: assessedRows.filter((row) =>
          row.issues.some((issue) => issue === "CWA is required.")
        ).length,
        nameMismatchRows: assessedRows.filter((row) => row.warnings.length > 0).length,
        existingAcademicHistoryRecords: registryStats.existingAcademicHistoryRecords
      },
      rows: assessedRows
    };
  }

  async function assessImportPreview(payload) {
    const preview = buildStudentImportPreview(payload.rows || [], payload.resolutions || {});
    const importMode = normalizeImportMode(payload.importMode);
    const rows = [];
    const validRows = preview.rows.filter((row) => row.status === "valid");
    const existingLookup = await repositories.students.findExistingByIdentifierBatch({
      studentReferenceIds: validRows
        .map((row) => row.payload.studentReferenceId)
        .filter(Boolean),
      indexNumbers: validRows.map((row) => row.payload.indexNumber).filter(Boolean)
    });
    const registryStats = await getRegistryStats();

    for (const row of preview.rows) {
      if (row.status !== "valid") {
        rows.push({
          ...row,
          existingMatches: []
        });
        continue;
      }

      const duplicates = getExistingMatches(existingLookup, row.payload);

      if (duplicates.length > 0) {
        if (importMode === "skip_existing") {
          rows.push({
            ...row,
            existingMatches: duplicates,
            warnings: [...(row.warnings || []), "Already exists in the registry and will be skipped in this import mode."]
          });
          continue;
        }

        rows.push({
          ...row,
          status: "invalid",
          issues: [...row.issues, "Matches an existing student record in the registry."],
          existingMatches: duplicates
        });
        continue;
      }

      rows.push({
        ...row,
        existingMatches: []
      });
    }

    return {
      ...preview,
      summary: {
        totalRows: rows.length,
        validRows: rows.filter((row) => row.status === "valid").length,
        invalidRows: rows.filter((row) => row.status === "invalid").length,
        existingRegistryStudents: registryStats.existingRegistryStudents
      },
      rows
    };
  }

  async function prepareStudentRecordInput(payload, options = {}) {
    assertRequiredString(payload.fullName, "fullName", "Full name");
    assertRequiredString(payload.studentReferenceId, "studentReferenceId", "Student reference ID");
    assertRequiredString(payload.college, "college", "College");
    assertRequiredString(payload.program, "program", "Program");
    assertRequiredString(payload.year, "year", "Year");

    const duplicates = options.skipIdentifierConflictCheck
      ? []
      : await repositories.students.findByIdentifiers({
          studentReferenceId: payload.studentReferenceId,
          indexNumber: payload.indexNumber
        });

    if (duplicates.length > 0) {
      throw new ConflictError("A student with one of the supplied identifiers already exists.", {
        duplicates
      });
    }

    return {
      id: createId("student"),
      fullName: payload.fullName.trim(),
      firstName: payload.firstName?.trim() || null,
      middleName: payload.middleName?.trim() || null,
      lastName: payload.lastName?.trim() || null,
      studentReferenceId: payload.studentReferenceId.trim(),
      indexNumber: payload.indexNumber?.trim() || null,
      college: payload.college.trim(),
      program: payload.program.trim(),
      year: payload.year.trim(),
      cycleId: payload.cycleId?.trim() || null,
      gender: payload.gender?.trim() || null,
      disabilityStatus: payload.disabilityStatus?.trim() || null,
      phoneNumber: payload.phoneNumber?.trim() || null,
      email: payload.email?.trim() || null,
      cwa: normalizeNumber(payload.cwa, "cwa", "CWA"),
      wassceAggregate: normalizeNumber(
        payload.wassceAggregate,
        "wassceAggregate",
        "WASSCE Aggregate"
      ),
      notes: payload.notes?.trim() || null
    };
  }

  async function createStudentRecord(payload, options = {}) {
    const input = await prepareStudentRecordInput(payload, options);
    return repositories.students.create(input);
  }

  return {
    async search(filters) {
      return repositories.students.search({
        q: (filters.q || "").trim(),
        studentReferenceId: (filters.studentReferenceId || "").trim(),
        indexNumber: (filters.indexNumber || "").trim(),
        duplicateFlag: parseBooleanFilter(filters.duplicateFlag),
        conflictFlag: parseBooleanFilter(filters.conflictFlag),
        flaggedOnly: parseBooleanFilter(filters.flaggedOnly)
      });
    },
    async getById(id) {
      const student = await repositories.students.getById(id);
      if (!student) {
        throw new NotFoundError("Student was not found.");
      }

      return student;
    },
    async create(payload) {
      return createStudentRecord(payload);
    },
    async updateContact(studentId, payload) {
      assertRequiredString(studentId, "studentId", "Student");
      await this.getById(studentId);
      return repositories.students.updateContact(studentId, {
        email: payload.email === undefined ? undefined : normalizeEmail(payload.email),
        phoneNumber: payload.phoneNumber === undefined ? undefined : String(payload.phoneNumber || "").trim() || null
      });
    },
    async listAcademicHistory(filters) {
      return repositories.students.listAcademicHistory({
        q: (filters.q || "").trim(),
        studentId: (filters.studentId || "").trim(),
        studentReferenceId: (filters.studentReferenceId || "").trim(),
        indexNumber: (filters.indexNumber || "").trim(),
        assessmentOnly: String(filters.includeProfiles || "").toLowerCase() !== "true"
      });
    },
    async getAcademicHistoryImportHistory(filters = {}) {
      return repositories.students.listAcademicHistoryImportHistory({
        academicYearLabel: (filters.academicYearLabel || "").trim(),
        semesterLabel: (filters.semesterLabel || "").trim()
      });
    },
    async clearRegistry(actor) {
      const cleared = await repositories.students.clearRegistry();
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.cleared",
        entityType: "student_registry",
        entityId: "registry",
        summary: "Student registry records were cleared.",
        metadata: cleared
      });

      return {
        summary: cleared,
        message: `Registry cleared successfully. Removed ${cleared.students} student record(s).`
      };
    },
    async getStats() {
      return getRegistryStats();
    },
    async previewImport(payload) {
      const preview = await assessImportPreview(payload);
      return buildPreviewResponse(preview);
    },
    async importRows(payload, actor) {
      const preview = await assessImportPreview(payload);
      const importableRows = [];
      const rejectedRows = [];
      const skippedRows = [];
      const validRows = [];
      const importMode = normalizeImportMode(payload.importMode);

      for (const row of preview.rows) {
        if (row.status !== "valid") {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            issues: row.issues
          });
          continue;
        }

        validRows.push(row);
      }

      for (const chunk of chunkItems(validRows, STUDENT_IMPORT_BATCH_SIZE)) {
        const rowsToCreate =
          importMode === "skip_existing"
            ? chunk.filter((row) => !(row.existingMatches?.length > 0))
            : chunk;

        if (importMode === "skip_existing") {
          for (const row of chunk) {
            if (row.existingMatches?.length > 0) {
              skippedRows.push({
                rowNumber: row.rowNumber,
                studentReferenceId: row.payload.studentReferenceId,
                fullName: row.payload.fullName,
                existingStudent: row.existingMatches[0] || null
              });
            }
          }
        }

        if (!rowsToCreate.length) {
          continue;
        }

        try {
          const preparedInputs = await Promise.all(
            rowsToCreate.map((row) =>
              prepareStudentRecordInput(row.payload, {
                skipIdentifierConflictCheck: true
              })
            )
          );
          const createdItems = repositories.students.createMany
            ? await repositories.students.createMany(preparedInputs)
            : null;

          if (!createdItems || createdItems.length !== rowsToCreate.length) {
            throw new Error("Bulk registry import could not return the expected rows.");
          }

          for (let index = 0; index < rowsToCreate.length; index += 1) {
            importableRows.push({
              rowNumber: rowsToCreate[index].rowNumber,
              item: createdItems[index]
            });
          }
        } catch {
          for (const row of rowsToCreate) {
            try {
              const item = await createStudentRecord(row.payload, {
                skipIdentifierConflictCheck: true
              });
              importableRows.push({
                rowNumber: row.rowNumber,
                item
              });
            } catch (error) {
              rejectedRows.push({
                rowNumber: row.rowNumber,
                issues: [error.message]
              });
            }
          }
        }
      }

      const result = {
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: importableRows.length,
          rejectedRows: rejectedRows.length,
          skippedExistingRows: skippedRows.length
        },
        importedRows: importableRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRows: rejectedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        skippedRows: skippedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsReturned: Math.min(importableRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRowsReturned: Math.min(rejectedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        skippedRowsReturned: Math.min(skippedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsTruncated: importableRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        rejectedRowsTruncated: rejectedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        skippedRowsTruncated: skippedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        preview: buildPreviewResponse(preview)
      };
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.imported",
        entityType: "student_registry_import",
        entityId: payload.fileName || "student-import",
        summary: "Student registry import completed.",
        metadata: result.summary
      });
      return result;
    },
    async previewAcademicHistoryImport(payload) {
      const preview = await assessAcademicHistoryPreview(payload);
      return buildAcademicHistoryPreviewResponse(preview);
    },
    async importAcademicHistoryRows(payload, actor) {
      const preview = await assessAcademicHistoryPreview(payload);
      const importedRows = [];
      const rejectedRows = [];
      const batchReference = createId("academic-history-batch");
      const batchChanges = [];
      let updatedRows = 0;

      for (const row of preview.rows) {
        if (row.status !== "valid" || !row.matchedStudent) {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            indexNumber: row.payload.indexNumber,
            fullName: row.payload.fullName,
            issues: row.issues
          });
          continue;
        }

        try {
          const cycleId = await resolveCycleIdForAcademicYearLabel(row.payload.academicYearLabel);
          const previousRecord = repositories.students.findAcademicHistoryRecord
            ? await repositories.students.findAcademicHistoryRecord({
                studentId: row.matchedStudent.id,
                academicYearLabel: row.payload.academicYearLabel,
                semesterLabel: row.payload.semesterLabel,
                program: row.payload.program || row.matchedStudent.program || null
              })
            : null;
          const item = await repositories.students.upsertAcademicHistoryEntry({
            studentId: row.matchedStudent.id,
            cycleId,
            college: row.payload.college || row.matchedStudent.college || null,
            program: row.payload.program || row.matchedStudent.program || null,
            year: row.payload.year || row.matchedStudent.year || null,
            academicYearLabel: row.payload.academicYearLabel,
            semesterLabel: row.payload.semesterLabel,
            cwa: row.payload.cwa,
            wassceAggregate: row.matchedStudent.wassceAggregate ?? null,
            importBatchReference: batchReference,
            sourceFileName: payload.fileName || null
          });

          importedRows.push({
            rowNumber: row.rowNumber,
            item
          });
          if (previousRecord) {
            updatedRows += 1;
          }
          batchChanges.push({
            profileId: item?.id || null,
            actionType: previousRecord ? "updated" : "created",
            previousRecord,
            nextRecord: item
          });
        } catch (error) {
          rejectedRows.push({
            rowNumber: row.rowNumber,
            indexNumber: row.payload.indexNumber,
            fullName: row.payload.fullName,
            issues: [error.message]
          });
        }
      }

      const result = {
        batchReference,
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: importedRows.length,
          rejectedRows: rejectedRows.length,
          updatedRows
        },
        importedRows: importedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRows: rejectedRows.slice(0, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsReturned: Math.min(importedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        rejectedRowsReturned: Math.min(rejectedRows.length, IMPORT_RESULT_DISPLAY_LIMIT),
        importedRowsTruncated: importedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        rejectedRowsTruncated: rejectedRows.length > IMPORT_RESULT_DISPLAY_LIMIT,
        preview: buildAcademicHistoryPreviewResponse(preview)
      };
      if (repositories.students.saveAcademicHistoryImportBatch && importedRows.length) {
        await repositories.students.saveAcademicHistoryImportBatch({
          batchReference,
          academicYearLabel: normalizeText(payload.academicYearLabel),
          semesterLabel: normalizeText(payload.semesterLabel) || "Final Results",
          fileName: payload.fileName || null,
          importedRows: importedRows.length,
          updatedRows,
          status: "completed",
          createdByName: actor?.fullName || null,
          changes: batchChanges
        });
      }
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.academic_history_imported",
        entityType: "student_registry_import",
        entityId: batchReference,
        summary: "Student academic history import completed.",
        metadata: {
          ...result.summary,
          batchReference,
          fileName: payload.fileName || null
        }
      });
      return result;
    },
    async updateAcademicHistoryRecord(id, payload, actor) {
      assertRequiredString(id, "id", "Academic history record");
      assertRequiredString(payload.reason, "reason", "Update reason");

      const existing = await repositories.students.getAcademicHistoryRecordById(id);
      if (!existing) {
        throw new NotFoundError("Academic history record was not found.");
      }

      const item = await repositories.students.updateAcademicHistoryRecord(id, {
        college:
          payload.college !== undefined ? normalizeText(payload.college) : undefined,
        program:
          payload.program !== undefined ? normalizeText(payload.program) : undefined,
        year: payload.year !== undefined ? normalizeText(payload.year) : undefined,
        academicYearLabel:
          payload.academicYearLabel !== undefined
            ? normalizeText(payload.academicYearLabel)
            : undefined,
        semesterLabel:
          payload.semesterLabel !== undefined ? normalizeText(payload.semesterLabel) : undefined,
        cwa: payload.cwa !== undefined ? normalizeNumber(payload.cwa, "cwa", "CWA") : undefined,
        wassceAggregate:
          payload.wassceAggregate !== undefined
            ? normalizeNumber(payload.wassceAggregate, "wassceAggregate", "WASSCE Aggregate")
            : undefined
      });

      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.academic_history_updated",
        entityType: "student_academic_history",
        entityId: String(id),
        summary: "Academic history record was updated.",
        metadata: {
          reason: normalizeText(payload.reason),
          before: existing,
          after: item
        }
      });

      return {
        item,
        message: "Academic history record updated successfully."
      };
    },
    async deleteAcademicHistoryRecord(id, payload, actor) {
      assertRequiredString(id, "id", "Academic history record");
      assertRequiredString(payload.reason, "reason", "Deletion reason");

      const existing = await repositories.students.deleteAcademicHistoryRecord(id);
      if (!existing) {
        throw new NotFoundError("Academic history record was not found.");
      }

      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.academic_history_deleted",
        entityType: "student_academic_history",
        entityId: String(id),
        summary: "Academic history record was deleted.",
        metadata: {
          reason: normalizeText(payload.reason),
          record: existing
        }
      });

      return {
        removedId: String(id),
        record: existing,
        message: "Academic history record deleted successfully."
      };
    },
    async rollbackAcademicHistoryImportBatch(payload, actor) {
      assertRequiredString(payload.batchReference, "batchReference", "Import batch");
      assertRequiredString(payload.reason, "reason", "Rollback reason");

      const result = await repositories.students.rollbackAcademicHistoryImportBatch(
        payload.batchReference,
        {
          reason: normalizeText(payload.reason),
          actorName: actor?.fullName || null
        }
      );
      if (!result) {
        throw new NotFoundError("Academic history import batch was not found or has already been rolled back.");
      }

      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.academic_history_import_rolled_back",
        entityType: "student_registry_import",
        entityId: String(payload.batchReference),
        summary: "Academic history import batch was rolled back.",
        metadata: {
          reason: normalizeText(payload.reason),
          deletedRows: result.deletedRows,
          restoredRows: result.restoredRows
        }
      });

      return {
        batch: result.batch,
        deletedRows: result.deletedRows,
        restoredRows: result.restoredRows,
        message: `Academic history batch rollback completed. Removed ${result.deletedRows} record(s) and restored ${result.restoredRows} record(s).`
      };
    },
    async clearAcademicHistoryScope(payload, actor) {
      assertRequiredString(payload.academicYearLabel, "academicYearLabel", "Academic year");
      assertRequiredString(payload.semesterLabel, "semesterLabel", "Semester");
      assertRequiredString(payload.reason, "reason", "Clear reason");

      const summary = await repositories.students.clearAcademicHistoryScope({
        academicYearLabel: normalizeText(payload.academicYearLabel),
        semesterLabel: normalizeText(payload.semesterLabel)
      });

      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "student_registry.academic_history_cleared",
        entityType: "student_academic_history_scope",
        entityId: `${payload.academicYearLabel}:${payload.semesterLabel}`,
        summary: "Academic history scope was cleared.",
        metadata: {
          reason: normalizeText(payload.reason),
          academicYearLabel: normalizeText(payload.academicYearLabel),
          semesterLabel: normalizeText(payload.semesterLabel),
          deletedRows: summary.deletedRows
        }
      });

      return {
        summary,
        message: `Cleared ${summary.deletedRows} imported academic history record(s) for ${payload.semesterLabel} in ${payload.academicYearLabel}.`
      };
    }
  };
}
