import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { buildFoodBankImportPreview } from "./import.js";

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function normalizeSemester(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["first", "first semester", "semester 1", "1", "1st", "first_semester"].includes(text)) {
    return "first_semester";
  }
  if (["second", "second semester", "semester 2", "2", "2nd", "second_semester"].includes(text)) {
    return "second_semester";
  }
  return "";
}

function formatSupportTypeLabel(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "food_support":
      return "Food Support";
    case "clothing_support":
      return "Clothing Support";
    default:
      return "";
  }
}

function summarizeRecords(items = []) {
  const supportTypeCounts = {
    foodSupport: 0,
    clothingSupport: 0,
    both: 0
  };
  for (const item of items) {
    const supportTypes = Array.isArray(item.supportTypes) ? item.supportTypes : [];
    const hasFood = supportTypes.includes("food_support");
    const hasClothing = supportTypes.includes("clothing_support");
    if (hasFood) supportTypeCounts.foodSupport += 1;
    if (hasClothing) supportTypeCounts.clothingSupport += 1;
    if (hasFood && hasClothing) supportTypeCounts.both += 1;
  }
  return {
    total: items.length,
    registered: items.filter((item) => item.status === "registered").length,
    served: items.filter((item) => item.status === "served").length,
    supportTypeCounts
  };
}

async function hydrateRecord(repositories, item) {
  const student = item?.studentId ? await repositories.students.getById(item.studentId) : null;
  return {
    ...item,
    semester: normalizeSemester(item?.semester),
    supportTypes: Array.isArray(item?.supportTypes) ? item.supportTypes : ["food_support"],
    fullName: student?.fullName || "Unknown student",
    studentReferenceId: student?.studentReferenceId || null,
    indexNumber: student?.indexNumber || null,
    email: student?.email || null,
    college: student?.college || null,
    program: student?.program || null,
    year: student?.year || null
  };
}

async function hydrateRecords(repositories, items = []) {
  return Promise.all((items || []).map((item) => hydrateRecord(repositories, item)));
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

function buildExistingKeys(records = []) {
  return new Set(
    (records || []).map(
      (item) =>
        `${String(item.studentId)}::${normalizeAcademicYearLabel(item.academicYearLabel)}::${normalizeSemester(item.semester)}`
    )
  );
}

async function buildFoodBankReportSummary(repositories, currentYearLabel) {
  const items = await hydrateRecords(repositories, await repositories.foodBank.list({}));
  const safeCurrentYearLabel =
    normalizeAcademicYearLabel(currentYearLabel) ||
    [...new Set(items.map((item) => item.academicYearLabel).filter(Boolean))].sort(
      (left, right) => {
        const leftYear = Number(String(left).match(/\d{4}/)?.[0] || 0);
        const rightYear = Number(String(right).match(/\d{4}/)?.[0] || 0);
        return rightYear - leftYear;
      }
    )[0] ||
    "Current Academic Year";

  const buildCollegeBreakdown = (subset) => {
    const map = new Map();
    for (const item of subset) {
      const key = item.college || "Unknown / not captured";
      const existing =
        map.get(key) || { college: key, servedCount: 0, registeredCount: 0 };
      existing.registeredCount += 1;
      if (item.status === "served") {
        existing.servedCount += 1;
      }
      map.set(key, existing);
    }
    return [...map.values()].sort((left, right) => right.servedCount - left.servedCount);
  };

  const buildYearSummary = (label) => {
    const subset = items.filter(
      (item) => normalizeAcademicYearLabel(item.academicYearLabel) === normalizeAcademicYearLabel(label)
    );
    return {
      label,
      totalRegistered: subset.length,
      totalServed: subset.filter((item) => item.status === "served").length,
      collegesRepresentedCount: new Set(subset.map((item) => item.college).filter(Boolean)).size,
      collegeBreakdown: buildCollegeBreakdown(subset),
      supportTypeCounts: summarizeRecords(subset).supportTypeCounts
    };
  };

  const yearLabels = [...new Set(items.map((item) => item.academicYearLabel).filter(Boolean))].sort(
    (left, right) => {
      const leftYear = Number(String(left).match(/\d{4}/)?.[0] || 0);
      const rightYear = Number(String(right).match(/\d{4}/)?.[0] || 0);
      return rightYear - leftYear;
    }
  );

  const currentYear = buildYearSummary(safeCurrentYearLabel);
  const previousYears = yearLabels
    .filter((label) => normalizeAcademicYearLabel(label) !== normalizeAcademicYearLabel(safeCurrentYearLabel))
    .map((label) => buildYearSummary(label));

  return {
    currentYearLabel: safeCurrentYearLabel,
    currentYear,
    previousYears
  };
}

export function createFoodBankService({ repositories }) {
  return {
    async list(filters = {}) {
      const items = await hydrateRecords(repositories, await repositories.foodBank.list(filters));
      const query = String(filters.q || "").trim().toLowerCase();
      const filteredItems = query
        ? items.filter((item) => {
            const haystack = [
              item.fullName,
              item.studentReferenceId,
              item.indexNumber,
              item.college,
              item.semester,
              item.referralSource,
              item.notes,
              ...(Array.isArray(item.supportTypes)
                ? item.supportTypes.map((value) => formatSupportTypeLabel(value))
                : [])
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(query);
          })
        : items;
      return {
        items: filteredItems,
        total: filteredItems.length,
        summary: summarizeRecords(filteredItems),
        filterOptions: await repositories.foodBank.listFilterOptions()
      };
    },
    async create(payload, actor) {
      const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
      if (!academicYearLabel) {
        throw new ValidationError("Academic year is required.");
      }
      const supportTypes = Array.isArray(payload.supportTypes) ? payload.supportTypes : [];
      if (!supportTypes.length) {
        throw new ValidationError("Choose at least one support type.");
      }
      const semester = normalizeSemester(payload.semester);
      if (!semester) {
        throw new ValidationError("Semester is required.");
      }

      const student = await resolveStudentMatch(repositories, payload);
      const existing = await repositories.foodBank.findExisting(student.id, academicYearLabel, semester);
      if (existing) {
        throw new ValidationError(
          "This student already has a food or clothing support registration for the selected academic year and semester."
        );
      }

      const item = await repositories.foodBank.create(
        {
          studentId: student.id,
          academicYearLabel,
          semester,
          referralSource: String(payload.referralSource || "").trim() || null,
          notes: String(payload.notes || "").trim() || null,
          supportTypes,
          status: "registered",
          sourceType: "manual_add"
        },
        actor
      );
      return hydrateRecord(repositories, item);
    },
    async update(id, payload, actor) {
      const existingRecord = await repositories.foodBank.getById(id);
      if (!existingRecord) {
        throw new NotFoundError("Support registration was not found.");
      }

      const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
      if (!academicYearLabel) {
        throw new ValidationError("Academic year is required.");
      }
      const supportTypes = Array.isArray(payload.supportTypes) ? payload.supportTypes : [];
      if (!supportTypes.length) {
        throw new ValidationError("Choose at least one support type.");
      }
      const semester = normalizeSemester(payload.semester);
      if (!semester) {
        throw new ValidationError("Semester is required.");
      }

      const student = await resolveStudentMatch(repositories, payload);
      const duplicate = await repositories.foodBank.findExisting(student.id, academicYearLabel, semester);
      if (duplicate && String(duplicate.id) !== String(id)) {
        throw new ValidationError(
          "This student already has a food or clothing support registration for the selected academic year and semester."
        );
      }

      const item = await repositories.foodBank.update(
        id,
        {
          studentId: student.id,
          academicYearLabel,
          semester,
          referralSource: String(payload.referralSource || "").trim() || null,
          notes:
            payload.notes === undefined
              ? existingRecord.notes || null
              : String(payload.notes || "").trim() || null,
          supportTypes
        },
        actor
      );
      return hydrateRecord(repositories, item);
    },
    async previewImport(payload) {
      const existingKeys = buildExistingKeys(await repositories.foodBank.list({}));
      const preview = buildFoodBankImportPreview(payload.rows, {
        studentLookup: await buildStudentBatchLookup(repositories, payload.rows || []),
        existingKeys
      });
      return preview;
    },
    async importRows(payload, actor) {
      const preview = await this.previewImport(payload);
      const itemsToCreate = preview.rows
        .filter((row) => row.status === "valid" && row.matchedStudent)
        .map((row) => ({
          studentId: row.matchedStudent.id,
          academicYearLabel: row.payload.academicYearLabel,
          semester: row.payload.semester,
          referralSource: row.payload.referralSource || null,
          notes: row.payload.notes || null,
          supportTypes: row.payload.supportTypes || [],
          status: "registered"
        }));

      const result = await repositories.foodBank.importRows(
        {
          items: itemsToCreate,
          sourceFileName: payload.fileName || null
        },
        actor
      );

      return {
        summary: {
          totalRows: preview.summary.totalRows,
          validRows: preview.summary.validRows,
          invalidRows: preview.summary.invalidRows,
          importedRows: result.items.length
        },
        rows: preview.rows,
        importedItems: await hydrateRecords(repositories, result.items),
        batchReference: result.batchReference
      };
    },
    async markServed(id, actor) {
      const existing = await repositories.foodBank.getById(id);
      if (!existing) {
        throw new NotFoundError("Support registration was not found.");
      }
      if (existing.status === "served") {
        throw new ValidationError("This support registration has already been marked as served.");
      }
      const item = await repositories.foodBank.markServed(id, actor);
      return hydrateRecord(repositories, item);
    },
    async remove(id) {
      const existing = await repositories.foodBank.getById(id);
      if (!existing) {
        throw new NotFoundError("Support registration was not found.");
      }
      await repositories.foodBank.remove(id);
      return {
        id: String(id),
        removed: true
      };
    },
    async getReportSummary(currentYearLabel) {
      return buildFoodBankReportSummary(repositories, currentYearLabel);
    }
  };
}
