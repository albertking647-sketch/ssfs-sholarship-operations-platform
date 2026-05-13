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
  ["notes", "remarks"],
  ["programme", "program"],
  ["program", "program"],
  ["course", "program"],
  ["course of study", "program"],
  ["program offered", "program"],
  ["field of study", "program"]
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
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/\b\d{4}\/\d{4}\b/);
  const normalized = match ? match[0] : text;
  return /^\d{4}\/\d{4}$/.test(normalized) ? `${normalized} Academic Year` : normalized;
}

function normalizeSchemeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || null;
}

function normalizeCurrency(value, fallbackValue = "GHS", issues = []) {
  const allowedCurrencies = new Set(["GHS", "USD", "EUR", "GBP"]);
  const text = trimString(value);
  if (text) {
    const normalized = text.toUpperCase();
    if (!allowedCurrencies.has(normalized)) {
      issues.push(`Currency "${text}" is not supported. Use GHS, USD, EUR, or GBP.`);
    }
    return normalized;
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
  if (text === "single_cycle" || text.includes("single cycle")) return "single_cycle";
  return null;
}

function buildDuplicateKey(payload) {
  if (!payload.academicYearLabel || !payload.schemeName || !payload.studentReferenceId) {
    return "";
  }
  return [
    String(payload.academicYearLabel || "").trim().toLowerCase(),
    String(normalizeSchemeName(payload.schemeName) || "").toLowerCase(),
    String(payload.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildStudentReferenceKey(payload) {
  if (!payload?.studentReferenceId) {
    return "";
  }
  return String(payload.studentReferenceId || "").trim().toLowerCase();
}

function formatCrossScopeMatches(matches = []) {
  const uniqueMatches = [];
  for (const match of matches || []) {
    const academicYearLabel = String(match?.academicYearLabel || "").trim();
    const schemeName = String(match?.schemeName || "").trim();
    if (!academicYearLabel || !schemeName) continue;
    if (
      uniqueMatches.some(
        (item) => item.academicYearLabel === academicYearLabel && item.schemeName === schemeName
      )
    ) {
      continue;
    }
    uniqueMatches.push({ academicYearLabel, schemeName });
  }
  return uniqueMatches.slice(0, 3);
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
  if (parsed <= 0) {
    issues.push(`${label} must be greater than zero.`);
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
      schemeName: normalizeSchemeName(normalized.schemeName),
      sponsorName: trimString(normalized.sponsorName),
      fullName: trimString(normalized.fullName),
      studentReferenceId: trimString(normalized.studentReferenceId),
      program: trimString(normalized.program),
      indexNumber: trimString(normalized.indexNumber),
      college: trimString(normalized.college),
      amountPaid: normalizeNumeric(normalized.amountPaid, "Amount paid", issues),
      currency: normalizeCurrency(normalized.currency, context.defaultCurrency, issues),
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
    if (!supportType.provided || supportType.value === "unknown") {
      issues.push("Support type must be either Internal or External.");
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
        "Tagged as Continuing because this student was imported as a new beneficiary in the previous academic year."
      );
    }

    const isExistingDuplicate =
      Boolean(duplicateKey) && context.existingDuplicateKeys?.has?.(duplicateKey);
    const isUploadedDuplicate =
      Boolean(duplicateKey) && context.uploadDuplicateKeys?.has?.(duplicateKey);
    const hasCrossScopeDuplicate =
      Boolean(studentReferenceKey) && context.crossScopeDuplicateStudentIds?.has?.(studentReferenceKey);
    const crossScopeMatches = formatCrossScopeMatches(
      context.crossScopeDuplicateMatches?.[studentReferenceKey] || []
    );

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
      const locationNote = crossScopeMatches.length
        ? ` Existing records: ${crossScopeMatches
            .map((match) => `${match.schemeName} (${match.academicYearLabel})`)
            .join(", ")}.`
        : "";
      warnings.push(
        `This student reference ID already appears in other support records across different schemes or academic years. Review carefully before importing.${locationNote}`
      );
    }

    return {
      rowNumber,
      status: issues.length ? "invalid" : "valid",
      payload,
      duplicateStrategy: rowDuplicateStrategy,
      crossScopeMatches,
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
        [...(row.issues || []), ...(row.warnings || [])].some((message) =>
          message.includes("Support type must be either Internal or External.")
        )
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
