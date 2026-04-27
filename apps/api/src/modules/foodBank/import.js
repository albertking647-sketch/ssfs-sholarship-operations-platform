function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_./()-]+/g, " ")
    .replace(/\s+/g, " ");
}

function trimString(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeAcademicYearLabel(value) {
  const text = trimString(value);
  if (!text) return null;
  if (/^\d{4}\/\d{4}$/.test(text)) {
    return `${text} Academic Year`;
  }
  return text;
}

function normalizeSemester(value) {
  const text = trimString(value)?.toLowerCase() || "";
  if (!text) return null;
  if (["first", "first semester", "semester 1", "1", "1st", "first_semester"].includes(text)) {
    return "first_semester";
  }
  if (["second", "second semester", "semester 2", "2", "2nd", "second_semester"].includes(text)) {
    return "second_semester";
  }
  return null;
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["food", "food support", "food_support"].includes(text)) return "food_support";
  if (["clothing", "clothing support", "clothing_support"].includes(text)) {
    return "clothing_support";
  }
  return null;
}

function normalizeSupportTypes(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[;,/|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  return [...new Set(values.map(normalizeSupportType).filter(Boolean))];
}

const HEADER_ALIASES = new Map([
  ["academic year", "academicYearLabel"],
  ["academic year label", "academicYearLabel"],
  ["year", "academicYearLabel"],
  ["semester", "semester"],
  ["academic semester", "semester"],
  ["student id", "studentReferenceId"],
  ["reference number", "studentReferenceId"],
  ["student id reference number", "studentReferenceId"],
  ["student id or reference number", "studentReferenceId"],
  ["reference no", "studentReferenceId"],
  ["ref no", "studentReferenceId"],
  ["full name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["index number", "indexNumber"],
  ["index no", "indexNumber"],
  ["referring counselor", "referralSource"],
  ["referring counsellor", "referralSource"],
  ["referral source", "referralSource"],
  ["source", "referralSource"],
  ["support type", "supportTypes"],
  ["support types", "supportTypes"],
  ["type of support", "supportTypes"],
  ["notes", "notes"],
  ["remarks", "notes"]
]);

function mapRow(rawRow) {
  const normalized = {};
  for (const [header, value] of Object.entries(rawRow || {})) {
    const field = HEADER_ALIASES.get(normalizeHeader(header));
    if (!field) continue;
    if (normalized[field] === undefined || normalized[field] === null || normalized[field] === "") {
      normalized[field] = value;
    }
  }
  return normalized;
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
        "The row could not match any student in the registry. Only existing registry students can be registered for food or clothing support."
      ],
      student: null
    };
  }

  return {
    issues: [],
    student
  };
}

export function buildFoodBankImportPreview(rows, context) {
  if (!Array.isArray(rows)) {
    return {
      summary: { totalRows: 0, validRows: 0, invalidRows: 0, matchedRows: 0, duplicateRows: 0 },
      rows: []
    };
  }

  const previewRows = rows.map((rawRow, index) => {
    const rowNumber = index + 1;
    const normalized = mapRow(rawRow);
    const issues = [];
    const payload = {
      academicYearLabel: normalizeAcademicYearLabel(normalized.academicYearLabel),
      semester: normalizeSemester(normalized.semester),
      studentReferenceId: trimString(normalized.studentReferenceId),
      fullName: trimString(normalized.fullName),
      indexNumber: trimString(normalized.indexNumber),
      referralSource: trimString(normalized.referralSource),
      supportTypes: normalizeSupportTypes(normalized.supportTypes),
      notes: trimString(normalized.notes)
    };

    if (!payload.academicYearLabel) {
      issues.push("Academic year is required.");
    }
    if (!payload.semester) {
      issues.push("Semester is required. Use First Semester or Second Semester.");
    }
    if (!payload.studentReferenceId) {
      issues.push("Student ID / Reference Number is required.");
    }
    if (!payload.supportTypes.length) {
      issues.push("Support Type is required. Use Food Support, Clothing Support, or both.");
    }

    let matchedStudent = null;
    if (!issues.length) {
      const match = resolveMatchedStudent(context.studentLookup || {}, payload);
      issues.push(...match.issues);
      matchedStudent = match.student;
    }

    if (matchedStudent) {
      const duplicateKey = `${String(matchedStudent.id)}::${String(payload.academicYearLabel || "")}::${String(payload.semester || "")}`;
      if (context.existingKeys?.has?.(duplicateKey)) {
        issues.push(
          "This student already has a food or clothing support registration for the selected academic year."
        );
      }
    }

    return {
      rowNumber,
      status: issues.length ? "invalid" : "valid",
      payload,
      matchedStudent,
      issues
    };
  });

  return {
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((item) => item.status === "valid").length,
      invalidRows: previewRows.filter((item) => item.status !== "valid").length,
      matchedRows: previewRows.filter((item) => item.matchedStudent).length,
      duplicateRows: previewRows.filter((item) =>
        item.issues.some((issue) => issue.includes("already has a food or clothing support registration"))
      ).length
    },
    rows: previewRows
  };
}
