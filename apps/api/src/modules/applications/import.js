const HEADER_ALIASES = new Map([
  ["full name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["reference number", "studentReferenceId"],
  ["reference no", "studentReferenceId"],
  ["ref no", "studentReferenceId"],
  ["student id", "studentReferenceId"],
  ["phone number", "phoneNumber"],
  ["phone no", "phoneNumber"],
  ["phone", "phoneNumber"],
  ["mobile number", "phoneNumber"],
  ["mobile", "phoneNumber"],
  ["contact number", "phoneNumber"],
  ["tel", "phoneNumber"],
  ["email", "applicantEmail"],
  ["email address", "applicantEmail"],
  ["e mail", "applicantEmail"],
  ["applicant email", "applicantEmail"],
  ["student email", "applicantEmail"],
  ["programme of study", "program"],
  ["program of study", "program"],
  ["programme", "program"],
  ["program", "program"],
  ["current year", "year"],
  ["year", "year"],
  ["level", "year"],
  ["average score", "finalScore"],
  ["final score", "finalScore"],
  ["score", "finalScore"],
  ["remarks", "reviewerNotes"],
  ["comment", "reviewerNotes"],
  ["notes", "notes"]
]);

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[_./()-]+/g, " ")
    .replace(/\s+/g, " ");
}

function trimString(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeNumeric(value, label, issues) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const normalized = String(value).replace(/,/g, "");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    issues.push(`${label} must be a valid number.`);
    return null;
  }

  return parsed;
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

export function buildApplicationImportPreview(rows, context) {
  if (!Array.isArray(rows)) {
    return {
      summary: { totalRows: 0, validRows: 0, invalidRows: 0, matchedRows: 0, unmatchedRows: 0 },
      rows: []
    };
  }

  const previewRows = rows.map((rawRow, index) => {
    const rowNumber = index + 1;
    const normalized = mapRow(rawRow);
    const issues = [];
    const payload = {
      studentReferenceId: trimString(normalized.studentReferenceId),
      fullName: trimString(normalized.fullName),
      phoneNumber: trimString(normalized.phoneNumber),
      applicantEmail: trimString(normalized.applicantEmail),
      program: trimString(normalized.program),
      year: trimString(normalized.year),
      finalScore: normalizeNumeric(normalized.finalScore, "Average score", issues),
      reviewerNotes: trimString(normalized.reviewerNotes),
      notes: trimString(normalized.notes),
      schemeId: context.schemeId,
      cycleId: context.cycleId,
      importMode: context.importMode
    };

    if (!payload.studentReferenceId) {
      issues.push("Student reference ID is required.");
    }

    if (!payload.fullName) {
      issues.push("Full name is required.");
    }

    return {
      rowNumber,
      status: issues.length ? "invalid" : "valid",
      payload,
      issues
    };
  });

  return {
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length,
      matchedRows: 0,
      unmatchedRows: 0
    },
    rows: previewRows
  };
}
