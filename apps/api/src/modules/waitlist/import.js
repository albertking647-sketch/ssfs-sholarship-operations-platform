const HEADER_ALIASES = new Map([
  ["academic year", "academicYearLabel"],
  ["academic year label", "academicYearLabel"],
  ["year", "academicYearLabel"],
  ["scheme", "schemeName"],
  ["scheme name", "schemeName"],
  ["scholarship", "schemeName"],
  ["scholarship name", "schemeName"],
  ["support name", "schemeName"],
  ["support", "schemeName"],
  ["support name or scheme name", "schemeName"],
  ["scholarship name or support name", "schemeName"],
  ["full name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["student id", "studentReferenceId"],
  ["reference number", "studentReferenceId"],
  ["student id reference number", "studentReferenceId"],
  ["student id or reference number", "studentReferenceId"],
  ["index number", "indexNumber"],
  ["index no", "indexNumber"],
  ["recommendation reason", "recommendationReason"],
  ["reason", "recommendationReason"],
  ["notes", "notes"],
  ["remarks", "notes"],
  ["comment", "notes"]
]);

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
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

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

export function buildRecommendedImportPreview(rows) {
  if (!Array.isArray(rows)) {
    return {
      summary: { totalRows: 0, validRows: 0, invalidRows: 0 },
      rows: []
    };
  }

  const previewRows = rows.map((rawRow, index) => {
    const normalized = mapRow(rawRow);
    const issues = [];
    const warnings = [];
    const payload = {
      academicYearLabel: normalizeAcademicYearLabel(normalized.academicYearLabel),
      schemeName: trimString(normalized.schemeName),
      fullName: trimString(normalized.fullName),
      studentReferenceId: trimString(normalized.studentReferenceId),
      indexNumber: trimString(normalized.indexNumber),
      recommendationReason: trimString(normalized.recommendationReason),
      notes: trimString(normalized.notes)
    };

    if (!payload.academicYearLabel) {
      issues.push("Academic year is required.");
    }
    if (!payload.schemeName) {
      issues.push("Scheme name is required.");
    }
    if (!payload.studentReferenceId && !payload.indexNumber) {
      issues.push("Student ID / Reference Number is required.");
    }
    if (!payload.fullName) {
      warnings.push("Full name is blank and will be filled from the matched registry student.");
    }

    return {
      rowNumber: index + 1,
      status: issues.length ? "invalid" : "valid",
      payload,
      issues,
      warnings
    };
  });

  return {
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status !== "valid").length
    },
    rows: previewRows
  };
}
