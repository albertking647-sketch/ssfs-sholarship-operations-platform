const HEADER_ALIASES = new Map([
  ["academic year", "academicYearLabel"],
  ["academic year label", "academicYearLabel"],
  ["year", "academicYearLabel"],
  ["scholarship support name", "schemeName"],
  ["scholarship name or support name", "schemeName"],
  ["support name or scholarship name", "schemeName"],
  ["scholarship support", "schemeName"],
  ["support name", "schemeName"],
  ["support", "schemeName"],
  ["scheme", "schemeName"],
  ["scheme name", "schemeName"],
  ["scholarship", "schemeName"],
  ["scholarship name", "schemeName"],
  ["sponsor donor", "sponsorName"],
  ["sponsor", "sponsorName"],
  ["donor", "sponsorName"],
  ["funder", "sponsorName"],
  ["full name", "fullName"],
  ["beneficiary name", "fullName"],
  ["student name", "fullName"],
  ["name", "fullName"],
  ["reference number", "studentReferenceId"],
  ["student id reference number", "studentReferenceId"],
  ["student id or reference number", "studentReferenceId"],
  ["reference number student id", "studentReferenceId"],
  ["reference no", "studentReferenceId"],
  ["ref no", "studentReferenceId"],
  ["student id", "studentReferenceId"],
  ["index number", "indexNumber"],
  ["index no", "indexNumber"],
  ["college", "college"],
  ["college name", "college"],
  ["school", "college"],
  ["amount paid", "amountPaid"],
  ["amount", "amountPaid"],
  ["paid amount", "amountPaid"],
  ["currency", "currency"],
  ["support type", "supportType"],
  ["type", "supportType"],
  ["beneficiary cohort", "beneficiaryCohort"],
  ["cohort", "beneficiaryCohort"],
  ["beneficiary group", "beneficiaryCohort"],
  ["group", "beneficiaryCohort"],
  ["remarks", "remarks"],
  ["comment", "remarks"],
  ["notes", "remarks"]
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

function normalizeAcademicYearLabel(value) {
  const text = trimString(value);
  if (!text) return null;
  if (/^\d{4}\/\d{4}$/.test(text)) {
    return `${text} Academic Year`;
  }
  return text;
}

function normalizeCurrency(value, fallbackValue = "GHS") {
  const text = trimString(value);
  if (text) {
    return text.toUpperCase();
  }
  const fallback = trimString(fallbackValue);
  return fallback ? fallback.toUpperCase() : "GHS";
}

function normalizeSupportType(value) {
  const rawText = String(value || "").trim();
  const text = rawText.toLowerCase();
  if (!text) {
    return { value: "unknown", provided: false };
  }
  if (text.includes("internal")) return { value: "internal", provided: true };
  if (text.includes("external")) return { value: "external", provided: true };
  return { value: "unknown", provided: true };
}

function normalizeBeneficiaryCohort(value, fallbackValue = "") {
  const text = String(value || fallbackValue || "").trim().toLowerCase();
  if (!text || text === "not_applicable" || text === "not applicable" || text === "none") {
    return null;
  }
  if (text.includes("current")) return "current";
  if (text.includes("new")) return "new";
  return null;
}

function buildDuplicateKey(payload) {
  if (!payload.academicYearLabel || !payload.schemeName || !payload.studentReferenceId) {
    return "";
  }
  return [
    String(payload.academicYearLabel || "").trim().toLowerCase(),
    String(payload.schemeName || "").trim().toLowerCase(),
    String(payload.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildStudentReferenceKey(payload) {
  if (!payload?.studentReferenceId) {
    return "";
  }
  return String(payload.studentReferenceId || "").trim().toLowerCase();
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

export function buildBeneficiaryImportPreview(rows, context) {
  if (!Array.isArray(rows)) {
    return {
      summary: { totalRows: 0, validRows: 0, invalidRows: 0 },
      rows: []
    };
  }

  const previewRows = rows.map((rawRow, index) => {
    const rowNumber = index + 1;
    const normalized = mapRow(rawRow);
    const issues = [];
    const warnings = [];
    const supportType = normalizeSupportType(normalized.supportType);
    const explicitBeneficiaryCohort = normalizeBeneficiaryCohort(
      normalized.beneficiaryCohort,
      context.defaultBeneficiaryCohort
    );
    const payload = {
      academicYearLabel: normalizeAcademicYearLabel(normalized.academicYearLabel),
      schemeName: trimString(normalized.schemeName),
      sponsorName: trimString(normalized.sponsorName),
      fullName: trimString(normalized.fullName),
      studentReferenceId: trimString(normalized.studentReferenceId),
      indexNumber: trimString(normalized.indexNumber),
      college: trimString(normalized.college),
      amountPaid: normalizeNumeric(normalized.amountPaid, "Amount paid", issues),
      currency: normalizeCurrency(normalized.currency, context.defaultCurrency),
      supportType: supportType.value,
      beneficiaryCohort: explicitBeneficiaryCohort,
      carriedForwardFromPriorYear: false,
      remarks: trimString(normalized.remarks),
      importMode: context.importMode || "historical_archive",
      categorizedByCollege: Boolean(context.categorizedByCollege)
    };

    if (!payload.academicYearLabel) {
      issues.push("Academic year is required.");
    }
    if (!payload.schemeName) {
      issues.push("Scholarship or support name is required.");
    }
    if (!payload.fullName) {
      issues.push("Beneficiary full name is required.");
    }
    if (!payload.studentReferenceId) {
      issues.push("Student reference ID is required.");
    }
    if (context.categorizedByCollege && !payload.college) {
      issues.push("College is required when the imported list is categorized into colleges.");
    }
    if (payload.amountPaid === null) {
      issues.push("Amount paid is required.");
    }
    if (!supportType.provided) {
      warnings.push("Support type is blank and will default to Unknown / other.");
    }

    const duplicateKey = buildDuplicateKey(payload);
    const studentReferenceKey = buildStudentReferenceKey(payload);
    const rowDuplicateStrategy =
      context.duplicateRowActions?.[rowNumber] || context.duplicateStrategy || "skip";
    const inferredPriorYearCurrent =
      !explicitBeneficiaryCohort &&
      context.importMode === "current_cycle_linked" &&
      Boolean(duplicateKey) &&
      context.priorYearNewBeneficiaryKeys?.has?.(duplicateKey);

    if (inferredPriorYearCurrent) {
      payload.beneficiaryCohort = "current";
      payload.carriedForwardFromPriorYear = true;
      warnings.push(
        "Tagged as Current Beneficiaries because this student was imported as a new beneficiary in the previous academic year."
      );
    }

    const isExistingDuplicate =
      Boolean(duplicateKey) && context.existingDuplicateKeys?.has?.(duplicateKey);
    const isUploadedDuplicate =
      Boolean(duplicateKey) && context.uploadDuplicateKeys?.has?.(duplicateKey);
    const hasCrossScopeDuplicate =
      Boolean(studentReferenceKey) && context.crossScopeDuplicateStudentIds?.has?.(studentReferenceKey);

    if (isExistingDuplicate) {
      const message =
        "This student reference ID already exists under the same support name and academic year.";
      if (rowDuplicateStrategy === "import_anyway") {
        warnings.push(`${message} It will still import because you chose Import anyway.`);
      } else if (rowDuplicateStrategy === "replace_existing") {
        warnings.push(`${message} The existing beneficiary row will be replaced for this support and academic year.`);
      } else {
        issues.push(`${message} It will be skipped unless you choose another duplicate action.`);
      }
    }
    if (isUploadedDuplicate) {
      const message = "This student reference ID is repeated within the uploaded beneficiary rows.";
      if (rowDuplicateStrategy === "import_anyway") {
        warnings.push(`${message} It will still import because you chose Import anyway.`);
      } else {
        issues.push(`${message} It will be skipped unless you choose Import anyway.`);
      }
    }
    if (hasCrossScopeDuplicate) {
      warnings.push(
        "This student reference ID already appears in other support records across different schemes or academic years. Review carefully before importing."
      );
    }

    return {
      rowNumber,
      status: issues.length ? "invalid" : "valid",
      payload,
      duplicateStrategy: rowDuplicateStrategy,
      issues,
      warnings
    };
  });

  return {
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length,
      unknownSupportTypeRows: previewRows.filter((row) =>
        (row.warnings || []).some((warning) => warning.includes("Support type is blank"))
      ).length,
      rolledForwardRows: previewRows.filter((row) =>
        (row.warnings || []).some((warning) => warning.includes("previous academic year"))
      ).length,
      duplicateRows: previewRows.filter((row) =>
        [...(row.issues || []), ...(row.warnings || [])].some((issue) =>
          issue.toLowerCase().includes("duplicate") || issue.toLowerCase().includes("already exists")
        )
      ).length,
      crossScopeDuplicateRows: previewRows.filter((row) =>
        (row.warnings || []).some((warning) => warning.toLowerCase().includes("other support records"))
      ).length,
      replaceExistingRows: previewRows.filter((row) => row.duplicateStrategy === "replace_existing").length,
      importAnywayRows: previewRows.filter((row) => row.duplicateStrategy === "import_anyway").length,
      cohortTaggedRows: previewRows.filter((row) => Boolean(row.payload?.beneficiaryCohort)).length
    },
    rows: previewRows
  };
}
