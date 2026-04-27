const HEADER_ALIASES = new Map([
  ["full name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["student id", "studentReferenceId"],
  ["reference number", "studentReferenceId"],
  ["reference no", "studentReferenceId"],
  ["ref no", "studentReferenceId"],
  ["ref number", "studentReferenceId"],
  ["student reference id", "studentReferenceId"],
  ["index number", "indexNumber"],
  ["index no", "indexNumber"],
  ["college", "college"],
  ["programme", "program"],
  ["program", "program"],
  ["programme of study", "program"],
  ["program of study", "program"],
  ["year", "year"],
  ["level", "year"],
  ["gender", "gender"],
  ["disability", "disabilityStatus"],
  ["disability status", "disabilityStatus"],
  ["phone", "phoneNumber"],
  ["phone number", "phoneNumber"],
  ["mobile", "phoneNumber"],
  ["email", "email"],
  ["e-mail", "email"],
  ["cwa", "cwa"],
  ["cumulative weighted average", "cwa"],
  ["wassce aggregate", "wassceAggregate"],
  ["aggregate", "wassceAggregate"],
  ["cycle", "cycleId"],
  ["academic cycle", "cycleId"],
  ["notes", "notes"],
  ["comment", "notes"]
]);

const REQUIRED_FIELDS = [
  ["fullName", "Full name"],
  ["studentReferenceId", "Student reference ID"],
  ["college", "College"],
  ["program", "Program"],
  ["year", "Year"]
];

const DUPLICATE_FIELDS = [
  {
    field: "studentReferenceId",
    label: "Student reference ID"
  },
  {
    field: "indexNumber",
    label: "Index number"
  }
];

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
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

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    issues.push(`${label} must be a valid number.`);
    return null;
  }

  return parsed;
}

function mapRow(rawRow) {
  const normalized = {};
  const unmappedHeaders = [];

  for (const [header, value] of Object.entries(rawRow || {})) {
    const field = HEADER_ALIASES.get(normalizeHeader(header));
    if (!field) {
      unmappedHeaders.push(header);
      continue;
    }

    if (normalized[field] === undefined || normalized[field] === null || normalized[field] === "") {
      normalized[field] = value;
    }
  }

  return {
    normalized,
    unmappedHeaders
  };
}

function validateNormalizedRow(normalized, rowNumber) {
  const issues = [];
  const payload = {
    fullName: trimString(normalized.fullName),
    studentReferenceId: trimString(normalized.studentReferenceId),
    indexNumber: trimString(normalized.indexNumber),
    college: trimString(normalized.college),
    program: trimString(normalized.program),
    year: trimString(normalized.year),
    gender: trimString(normalized.gender),
    disabilityStatus: trimString(normalized.disabilityStatus),
    phoneNumber: trimString(normalized.phoneNumber),
    email: trimString(normalized.email),
    cwa: normalizeNumeric(normalized.cwa, "CWA", issues),
    wassceAggregate: normalizeNumeric(normalized.wassceAggregate, "WASSCE Aggregate", issues),
    cycleId: trimString(normalized.cycleId),
    notes: trimString(normalized.notes)
  };

  for (const [field, label] of REQUIRED_FIELDS) {
    if (!payload[field]) {
      issues.push(`${label} is required.`);
    }
  }

  return {
    rowNumber,
    payload,
    issues
  };
}

export function buildStudentImportPreview(rows, resolutions = {}) {
  if (!Array.isArray(rows)) {
    return {
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0
      },
      rows: [],
      fileDuplicates: [],
      duplicateCases: []
    };
  }

  const normalizedPreviewRows = rows.map((rawRow, index) => {
    const rowNumber = index + 1;
    const { normalized, unmappedHeaders } = mapRow(rawRow);
    const result = validateNormalizedRow(normalized, rowNumber);

    return {
      rowNumber,
      payload: result.payload,
      baseIssues: [...result.issues],
      issues: [...result.issues],
      unmappedHeaders
    };
  });

  const rowLookup = new Map(normalizedPreviewRows.map((row) => [row.rowNumber, row]));
  const duplicateCases = [];
  const rowDuplicateIssues = new Map();
  const fileDuplicates = [];

  for (const { field, label } of DUPLICATE_FIELDS) {
    const groups = new Map();

    for (const row of normalizedPreviewRows) {
      const value = row.payload[field];
      if (!value) continue;

      const existing = groups.get(value) || [];
      existing.push(row.rowNumber);
      groups.set(value, existing);
    }

    for (const [value, rowNumbers] of groups) {
      if (rowNumbers.length < 2) {
        continue;
      }

      const duplicateCaseId = `${field}:${value}`;
      const requestedRowNumber = Number(resolutions[duplicateCaseId] || 0) || null;
      const selectedRowNumber =
        requestedRowNumber && rowNumbers.includes(requestedRowNumber) ? requestedRowNumber : null;
      duplicateCases.push({
        id: duplicateCaseId,
        field,
        label,
        value,
        selectedRowNumber,
        rows: rowNumbers.map((rowNumber) => {
          const row = rowLookup.get(rowNumber);
          return {
            rowNumber,
            fullName: row?.payload.fullName || null,
            studentReferenceId: row?.payload.studentReferenceId || null,
            indexNumber: row?.payload.indexNumber || null,
            college: row?.payload.college || null,
            program: row?.payload.program || null,
            year: row?.payload.year || null
          };
        })
      });

      for (const rowNumber of rowNumbers) {
        const rowIssues = rowDuplicateIssues.get(rowNumber) || [];
        if (selectedRowNumber && rowNumber !== selectedRowNumber) {
          rowIssues.push(
            `${label} ${value} was resolved in favor of row ${selectedRowNumber}.`
          );
        } else if (!selectedRowNumber) {
          const otherRow = rowNumbers.find((candidate) => candidate !== rowNumber);
          rowIssues.push(`${label} duplicates row ${otherRow}.`);
        }
        rowDuplicateIssues.set(rowNumber, rowIssues);
      }
    }
  }

  const previewRows = normalizedPreviewRows.map((row) => {
    const duplicateIssues = rowDuplicateIssues.get(row.rowNumber) || [];
    const issues = [...row.baseIssues, ...duplicateIssues];

    if (duplicateIssues.length > 0) {
      fileDuplicates.push({
        rowNumber: row.rowNumber,
        duplicateFields: duplicateIssues
      });
    }

    return {
      rowNumber: row.rowNumber,
      status: issues.length > 0 ? "invalid" : "valid",
      payload: row.payload,
      issues,
      unmappedHeaders: row.unmappedHeaders
    };
  });

  return {
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length
    },
    rows: previewRows,
    fileDuplicates,
    duplicateCases
  };
}
