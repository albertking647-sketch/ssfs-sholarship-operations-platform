const HEADER_ALIASES = new Map([
  ["full name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["reference number", "studentReferenceId"],
  ["reference no", "studentReferenceId"],
  ["ref no", "studentReferenceId"],
  ["student id", "studentReferenceId"],
  ["index number", "indexNumber"],
  ["index no", "indexNumber"],
  ["index no ", "indexNumber"],
  ["interview score", "interviewScore"],
  ["score", "interviewScore"],
  ["interview status", "interviewStatus"],
  ["status", "interviewStatus"],
  ["interview date", "interviewDate"],
  ["date", "interviewDate"],
  ["remarks", "interviewNotes"],
  ["notes", "interviewNotes"],
  ["comment", "interviewNotes"]
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

export function buildInterviewImportPreview(rows, context) {
  if (!Array.isArray(rows)) {
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        matchedRows: 0,
        unmatchedRows: 0
      },
      rows: []
    };
  }

  const duplicateKeys = new Map();
  const previewRows = rows.map((rawRow, index) => {
    const rowNumber = index + 1;
    const normalized = mapRow(rawRow);
    const issues = [];
    const payload = {
      fullName: trimString(normalized.fullName),
      studentReferenceId: trimString(normalized.studentReferenceId),
      indexNumber: trimString(normalized.indexNumber),
      interviewScore: normalizeNumeric(normalized.interviewScore, "Interview score", issues),
      interviewStatus: trimString(normalized.interviewStatus),
      interviewDate: trimString(normalized.interviewDate),
      interviewNotes: trimString(normalized.interviewNotes),
      schemeId: context.schemeId,
      cycleId: context.cycleId
    };

    if (!payload.studentReferenceId && !payload.indexNumber) {
      issues.push("Student reference ID or index number is required.");
    }

    if (payload.interviewScore === null && !payload.interviewStatus) {
      issues.push("Interview score or interview status is required.");
    }

    const duplicateKey = payload.studentReferenceId || payload.indexNumber || `row-${rowNumber}`;
    if (duplicateKeys.has(duplicateKey)) {
      issues.push(`This upload contains another interview row for ${duplicateKey}.`);
    } else {
      duplicateKeys.set(duplicateKey, rowNumber);
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
