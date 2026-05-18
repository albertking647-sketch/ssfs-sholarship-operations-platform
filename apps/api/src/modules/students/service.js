import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { createId } from "../../lib/ids.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { buildStudentImportPreview } from "./import.js";

const PREVIEW_DISPLAY_LIMIT = 160;
const IMPORT_RESULT_DISPLAY_LIMIT = 60;
const STUDENT_IMPORT_BATCH_SIZE = 1000;
const ACADEMIC_HISTORY_IMPORT_BATCH_SIZE = 5000;

function emitImportProgress(progress, event = {}) {
  if (typeof progress !== "function") {
    return;
  }
  const processedRows = Math.max(0, Number(event.processedRows || 0));
  const totalRows = Math.max(0, Number(event.totalRows || 0));
  const percent =
    event.percent !== undefined
      ? Math.max(0, Math.min(100, Math.round(Number(event.percent || 0))))
      : totalRows > 0
        ? Math.max(0, Math.min(100, Math.round((processedRows / totalRows) * 100)))
        : 0;
  progress({
    phase: event.phase || "importing",
    processedRows,
    totalRows,
    percent,
    message: event.message || "Importing rows..."
  });
}

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

function buildAcademicHistoryImportKey(input = {}) {
  return [
    input.studentId,
    input.academicYearLabel,
    input.semesterLabel,
    input.program || ""
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("\u001f");
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

  function buildAcademicHistoryPreviewResponse(preview, options = {}) {
    const rows = limitRowsByStatus(preview.rows, {
      validLimit: PREVIEW_DISPLAY_LIMIT / 2,
      invalidLimit: PREVIEW_DISPLAY_LIMIT / 2
    });

    const response = {
      summary: preview.summary,
      rows,
      returnedRows: rows.length,
      truncated: rows.length < preview.rows.length
    };
    if (options.includeImportRows) {
      response.importRows = preview.rows.map((row) => row.payload);
    }
    return response;
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

  function buildAcademicHistoryImportScopeOptions(...sources) {
    const grouped = new Map();
    const items = sources.flatMap((source) =>
      Array.isArray(source?.items) ? source.items : Array.isArray(source) ? source : []
    );

    for (const item of items) {
      const academicYearLabel = normalizeText(item?.academicYearLabel);
      const semesterLabel = normalizeText(item?.semesterLabel);
      if (!academicYearLabel || !semesterLabel) {
        continue;
      }

      const semesters = grouped.get(academicYearLabel) || new Set();
      semesters.add(semesterLabel);
      grouped.set(academicYearLabel, semesters);
    }

    const scopeItems = Array.from(grouped.entries())
      .map(([academicYearLabel, semesters]) => ({
        academicYearLabel,
        semesters: Array.from(semesters).sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
        )
      }))
      .sort((left, right) =>
        right.academicYearLabel.localeCompare(left.academicYearLabel, undefined, {
          numeric: true,
          sensitivity: "base"
        })
      );

    return {
      totalAcademicYears: scopeItems.length,
      items: scopeItems
    };
  }

  function cleanAcademicHistoryProgramLabel(value) {
    let text = normalizeText(value);
    if (!text) {
      return null;
    }

    const degreeMatch = text.match(
      /\b((?:B\.?\s?SC|B\.?\s?A|B\.?\s?ED|BBA|LLB|MSC|M\.?\s?PHIL|PHD|DIPLOMA|CERTIFICATE)\.?.*)$/i
    );
    if (degreeMatch) {
      text = degreeMatch[1];
    }

    text = text
      .replace(/\s*\(\s*\d+\s+students?\s*\)\s*$/i, "")
      .replace(/\s+\d{1,3}(?:\.\d+)?$/u, "")
      .replace(/\.+$/u, "")
      .trim();

    return text || null;
  }

  function getSingleIdentifierMatch(matches, issues, label) {
    if (!matches.length) {
      return null;
    }
    if (matches.length > 1) {
      issues.push(`This ${label} matched more than one registry student.`);
      return null;
    }
    return matches[0];
  }

  function resolveAcademicHistoryMatchedStudent(row, lookup) {
    const issues = [...row.issues];
    const referenceMatches = row.payload.studentReferenceId
      ? lookup.byReferenceId.get(row.payload.studentReferenceId) || []
      : [];
    const indexMatches = row.payload.indexNumber
      ? lookup.byIndexNumber.get(row.payload.indexNumber) || []
      : [];
    const referenceStudent = getSingleIdentifierMatch(referenceMatches, issues, "student reference ID");
    const indexStudent = getSingleIdentifierMatch(indexMatches, issues, "index number");

    if (referenceStudent && indexStudent && String(referenceStudent.id) !== String(indexStudent.id)) {
      issues.push("Student reference ID and index number matched different registry students.");
      return { issues, matchedStudent: null };
    }

    const matchedStudent = referenceStudent || indexStudent || null;
    if (!matchedStudent && !issues.length) {
      issues.push("No registry student matched this student reference ID or index number.");
    }

    return { issues, matchedStudent };
  }

  async function assessAcademicHistoryPreview(payload) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const previewRows = rows.map((rawRow, index) => {
      const issues = [];
      const studentReferenceId =
        normalizeText(rawRow.studentReferenceId) ||
        normalizeText(rawRow["Reference Number"]) ||
        normalizeText(rawRow["Student Reference ID"]) ||
        normalizeText(rawRow["Student ID"]) ||
        normalizeText(rawRow.STUDENTID) ||
        null;
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

      if (!studentReferenceId && !indexNumber) {
        issues.push("Student reference ID or index number is required.");
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
          studentReferenceId,
          indexNumber,
          fullName,
          academicYearLabel,
          semesterLabel,
          cwa,
          college: normalizeText(rawRow.college || rawRow.College) || null,
          program: cleanAcademicHistoryProgramLabel(
            rawRow.program || rawRow["Programme of Study"] || ""
          ),
          year: normalizeText(rawRow.year || rawRow.Year) || null,
          notes: normalizeText(rawRow.notes || rawRow.Notes) || null
        }
      };
    });

    const lookup = await repositories.students.findExistingByIdentifierBatch({
      studentReferenceIds: previewRows
        .filter((row) => row.status === "valid")
        .map((row) => row.payload.studentReferenceId)
        .filter(Boolean),
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

      const warnings = [...row.warnings];
      const { issues, matchedStudent } = resolveAcademicHistoryMatchedStudent(row, lookup);
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
    async listAcademicHistory(filters = {}) {
      const normalizedFilters = {
        q: (filters.q || "").trim(),
        studentId: (filters.studentId || "").trim(),
        studentReferenceId: (filters.studentReferenceId || "").trim(),
        indexNumber: (filters.indexNumber || "").trim(),
        academicYearLabel: (filters.academicYearLabel || "").trim(),
        semesterLabel: (filters.semesterLabel || "").trim()
      };
      if (!Object.values(normalizedFilters).some(Boolean)) {
        return [];
      }

      return repositories.students.listAcademicHistory({
        ...normalizedFilters,
        assessmentOnly: String(filters.includeProfiles || "").toLowerCase() !== "true"
      });
    },
    async getAcademicHistoryImportHistory(filters = {}) {
      const academicYearLabel = (filters.academicYearLabel || "").trim();
      const semesterLabel = (filters.semesterLabel || "").trim();
      const history = await repositories.students.listAcademicHistoryImportHistory({
        academicYearLabel,
        semesterLabel
      });
      const scopeRecordCount =
        academicYearLabel && semesterLabel && repositories.students.countAcademicHistory
          ? await repositories.students.countAcademicHistory({ academicYearLabel, semesterLabel })
          : 0;

      return {
        ...history,
        academicYearLabel,
        semesterLabel,
        scopeRecordCount
      };
    },
    async getAcademicHistoryImportScopeOptions() {
      const history = await repositories.students.listAcademicHistoryImportHistory({});
      let existingScopes = repositories.students.listAcademicHistoryScopes
        ? await repositories.students.listAcademicHistoryScopes()
        : await repositories.students.listAcademicHistory({});
      if (!existingScopes.length && repositories.students.countAcademicHistory) {
        const count = await repositories.students.countAcademicHistory();
        if (count > 0 && repositories.students.listAcademicHistory) {
          existingScopes = await repositories.students.listAcademicHistory({
            assessmentOnly: true,
            includeProfiles: "true"
          });
        }
      }
      return buildAcademicHistoryImportScopeOptions(history, existingScopes);
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
    async previewImport(payload, progress) {
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: 0,
        totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
        message: "Checking student registry rows..."
      });
      const preview = await assessImportPreview(payload);
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: preview.summary.totalRows,
        totalRows: preview.summary.totalRows,
        message: "Student registry preview ready."
      });
      return buildPreviewResponse(preview);
    },
    async importRows(payload, actor, progress) {
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: 0,
        totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
        message: "Checking student registry rows before import..."
      });
      const preview = await assessImportPreview(payload);
      const importableRows = [];
      const rejectedRows = [];
      const skippedRows = [];
      const validRows = [];
      const importMode = normalizeImportMode(payload.importMode);
      emitImportProgress(progress, {
        phase: "importing",
        processedRows: 0,
        totalRows: preview.summary.validRows,
        message: "Importing valid student registry rows..."
      });

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
          emitImportProgress(progress, {
            phase: "importing",
            processedRows: importableRows.length + skippedRows.length,
            totalRows: validRows.length,
            message: "Importing valid student registry rows..."
          });
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
            emitImportProgress(progress, {
              phase: "importing",
              processedRows: importableRows.length + rejectedRows.length + skippedRows.length,
              totalRows: preview.summary.totalRows,
              message: "Importing valid student registry rows..."
            });
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
    async previewAcademicHistoryImport(payload, progress) {
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: 0,
        totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
        message: "Matching CWA rows to registry students..."
      });
      const preview = await assessAcademicHistoryPreview(payload);
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: preview.summary.totalRows,
        totalRows: preview.summary.totalRows,
        message: "CWA preview ready."
      });
      return buildAcademicHistoryPreviewResponse(preview, { includeImportRows: true });
    },
    async importAcademicHistoryRows(payload, actor, progress) {
      emitImportProgress(progress, {
        phase: "validating",
        processedRows: 0,
        totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
        message: "Matching CWA rows to registry students..."
      });
      const preview = await assessAcademicHistoryPreview(payload);
      const importedRows = [];
      const rejectedRows = [];
      const batchReference = createId("academic-history-batch");
      const batchChanges = [];
      let updatedRows = 0;
      const importCandidates = [];
      const cycleIdByAcademicYear = new Map();

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
          if (!cycleIdByAcademicYear.has(row.payload.academicYearLabel)) {
            cycleIdByAcademicYear.set(
              row.payload.academicYearLabel,
              await resolveCycleIdForAcademicYearLabel(row.payload.academicYearLabel)
            );
          }
          importCandidates.push({
            row,
            input: {
              studentId: row.matchedStudent.id,
              cycleId: cycleIdByAcademicYear.get(row.payload.academicYearLabel),
              college: row.payload.college || row.matchedStudent.college || null,
              program: row.payload.program || row.matchedStudent.program || null,
              year: row.payload.year || row.matchedStudent.year || null,
              academicYearLabel: row.payload.academicYearLabel,
              semesterLabel: row.payload.semesterLabel,
              cwa: row.payload.cwa,
              wassceAggregate: row.matchedStudent.wassceAggregate ?? null,
              importBatchReference: batchReference,
              sourceFileName: payload.fileName || null
            }
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

      emitImportProgress(progress, {
        phase: "importing",
        processedRows: 0,
        totalRows: importCandidates.length,
        message: "Importing matched CWA rows into academic history..."
      });

      if (importCandidates.length) {
        const bulkUpsert = repositories.students.upsertAcademicHistoryEntries;
        const candidateGroupsByKey = new Map();
        const latestCandidateByKey = new Map();
        for (const candidate of importCandidates) {
          const importKey = buildAcademicHistoryImportKey(candidate.input);
          candidateGroupsByKey.set(importKey, [
            ...(candidateGroupsByKey.get(importKey) || []),
            candidate
          ]);
          latestCandidateByKey.set(importKey, candidate);
        }
        const uniqueCandidates = Array.from(latestCandidateByKey.entries()).map(
          ([importKey, candidate]) => ({ ...candidate, importKey })
        );

        if (bulkUpsert) {
          let processedImportRows = 0;

          for (const candidateBatch of chunkItems(
            uniqueCandidates,
            ACADEMIC_HISTORY_IMPORT_BATCH_SIZE
          )) {
            const batchRowCount = candidateBatch.reduce((total, candidate) => {
              return total + (candidateGroupsByKey.get(candidate.importKey) || [candidate]).length;
            }, 0);
            const nextProcessedRows = Math.min(
              processedImportRows + batchRowCount,
              importCandidates.length
            );
            const optimisticProcessedRows =
              nextProcessedRows >= importCandidates.length
                ? Math.max(processedImportRows, importCandidates.length - 1)
                : nextProcessedRows;
            if (optimisticProcessedRows > processedImportRows) {
              emitImportProgress(progress, {
                phase: "importing",
                processedRows: optimisticProcessedRows,
                totalRows: importCandidates.length,
                message: `Saving matched CWA rows ${processedImportRows + 1}-${nextProcessedRows} of ${importCandidates.length}...`
              });
            }

            try {
              const results = await bulkUpsert.call(
                repositories.students,
                candidateBatch.map((candidate) => candidate.input)
              );
              for (let index = 0; index < candidateBatch.length; index += 1) {
                const candidate = candidateBatch[index];
                const groupedCandidates = candidateGroupsByKey.get(candidate.importKey) || [candidate];
                const result = results[index] || {};
                const item = result.item || null;
                const previousRecord = result.previousRecord || null;
                processedImportRows += groupedCandidates.length;
                if (!item) {
                  for (const groupedCandidate of groupedCandidates) {
                    rejectedRows.push({
                      rowNumber: groupedCandidate.row.rowNumber,
                      indexNumber: groupedCandidate.row.payload.indexNumber,
                      fullName: groupedCandidate.row.payload.fullName,
                      issues: ["Academic history row could not be saved."]
                    });
                  }
                  continue;
                }

                for (const groupedCandidate of groupedCandidates) {
                  importedRows.push({
                    rowNumber: groupedCandidate.row.rowNumber,
                    item
                  });
                }
                if (previousRecord) {
                  updatedRows += 1;
                }
                batchChanges.push({
                  profileId: item?.id || null,
                  actionType: previousRecord ? "updated" : "created",
                  previousRecord,
                  nextRecord: item
                });
              }
            } catch (error) {
              for (const candidate of candidateBatch) {
                const groupedCandidates = candidateGroupsByKey.get(candidate.importKey) || [candidate];
                processedImportRows += groupedCandidates.length;
                for (const groupedCandidate of groupedCandidates) {
                  rejectedRows.push({
                    rowNumber: groupedCandidate.row.rowNumber,
                    indexNumber: groupedCandidate.row.payload.indexNumber,
                    fullName: groupedCandidate.row.payload.fullName,
                    issues: [error.message]
                  });
                }
              }
            }
            emitImportProgress(progress, {
              phase: "importing",
              processedRows: processedImportRows,
              totalRows: importCandidates.length,
              message:
                processedImportRows >= importCandidates.length
                  ? "Finished processing matched CWA rows."
                  : "Importing matched CWA rows into academic history..."
            });
          }
        } else {
          let processedImportRows = 0;
          const reportProcessedRow = () => {
            emitImportProgress(progress, {
              phase: "importing",
              processedRows: processedImportRows,
              totalRows: importCandidates.length,
              message:
                processedImportRows >= importCandidates.length
                  ? "Finished processing matched CWA rows."
                  : "Importing matched CWA rows into academic history..."
            });
          };

          for (const candidate of uniqueCandidates) {
            const groupedCandidates = candidateGroupsByKey.get(candidate.importKey) || [candidate];
            try {
              const previousRecord = repositories.students.findAcademicHistoryRecord
                ? await repositories.students.findAcademicHistoryRecord({
                    studentId: candidate.input.studentId,
                    academicYearLabel: candidate.input.academicYearLabel,
                    semesterLabel: candidate.input.semesterLabel,
                    program: candidate.input.program
                  })
                : null;
              const item = await repositories.students.upsertAcademicHistoryEntry(candidate.input);
              if (!item) {
                for (const groupedCandidate of groupedCandidates) {
                  rejectedRows.push({
                    rowNumber: groupedCandidate.row.rowNumber,
                    indexNumber: groupedCandidate.row.payload.indexNumber,
                    fullName: groupedCandidate.row.payload.fullName,
                    issues: ["Academic history row could not be saved."]
                  });
                }
              } else {
                for (const groupedCandidate of groupedCandidates) {
                  importedRows.push({
                    rowNumber: groupedCandidate.row.rowNumber,
                    item
                  });
                }
                if (previousRecord) {
                  updatedRows += 1;
                }
                batchChanges.push({
                  profileId: item?.id || null,
                  actionType: previousRecord ? "updated" : "created",
                  previousRecord,
                  nextRecord: item
                });
              }
            } catch (error) {
              for (const groupedCandidate of groupedCandidates) {
                rejectedRows.push({
                  rowNumber: groupedCandidate.row.rowNumber,
                  indexNumber: groupedCandidate.row.payload.indexNumber,
                  fullName: groupedCandidate.row.payload.fullName,
                  issues: [error.message]
                });
              }
            }

            for (let index = 0; index < groupedCandidates.length; index += 1) {
              processedImportRows += 1;
              reportProcessedRow();
            }
          }
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
        message: `Cleared ${summary.deletedRows} academic history record(s) for ${payload.semesterLabel} in ${payload.academicYearLabel}.`
      };
    }
  };
}
