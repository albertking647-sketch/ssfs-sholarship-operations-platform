import { createId } from "../../lib/ids.js";

function normalizeYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function parseAcademicYearRange(value) {
  const match = normalizeYearLabel(value).match(/(\d{4})\/(\d{4})/);
  if (!match) return null;
  return {
    startYear: Number(match[1]),
    endYear: Number(match[2])
  };
}

function buildAcademicYearLabel(startYear, endYear) {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    return "";
  }
  return `${startYear}/${endYear} Academic Year`;
}

function getPreviousAcademicYearLabel(value) {
  const range = parseAcademicYearRange(value);
  if (!range) return "";
  return buildAcademicYearLabel(range.startYear - 1, range.endYear - 1);
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "internal" || text === "external") return text;
  return "unknown";
}

function normalizeBeneficiaryCohort(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "not_applicable" || text === "not applicable" || text === "none") {
    return null;
  }
  if (text.includes("current")) return "current";
  if (text.includes("new")) return "new";
  return null;
}

function formatBeneficiaryCohort(value) {
  const normalized = normalizeBeneficiaryCohort(value);
  if (normalized === "current") return "Current Beneficiaries";
  if (normalized === "new") return "New Beneficiaries";
  return "Not tagged";
}

function normalizeCurrency(value) {
  return String(value || "GHS").trim().toUpperCase() || "GHS";
}

function buildCurrencyTotals(records) {
  const totals = new Map();
  for (const record of records) {
    const currency = normalizeCurrency(record.currency);
    const current = totals.get(currency) || 0;
    totals.set(currency, current + Number(record.amountPaid || 0));
  }

  return [...totals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([currency, amount]) => ({
      currency,
      amount,
      amountLabel: `${currency} ${Number(amount).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      })}`
    }));
}

function formatMoneySummary(records) {
  const currencyTotals = buildCurrencyTotals(records);
  if (!currencyTotals.length) {
    return "GHS 0";
  }

  return currencyTotals.map((item) => item.amountLabel).join(" + ");
}

function buildDistribution(items, selector, colors) {
  const distribution = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    const existing = distribution.get(key) || { count: 0, items: [] };
    existing.count += 1;
    existing.items.push(item);
    distribution.set(key, existing);
  }

  return [...distribution.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([label, value], index) => ({
      label,
      value: value.count,
      amountPaid: value.items.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0),
      amountPaidLabel: formatMoneySummary(value.items),
      currencyTotals: buildCurrencyTotals(value.items),
      color: colors[index % colors.length]
    }));
}

function formatCohortCounts(items) {
  const counts = {
    current: 0,
    new: 0,
    untagged: 0,
    carriedForward: 0
  };

  for (const item of items) {
    const cohort = normalizeBeneficiaryCohort(item.beneficiaryCohort);
    if (cohort === "current") counts.current += 1;
    else if (cohort === "new") counts.new += 1;
    else counts.untagged += 1;
    if (item.carriedForwardFromPriorYear) counts.carriedForward += 1;
  }

  return counts;
}

function sortAcademicYearsDesc(left, right) {
  const extractStartYear = (value) => {
    const match = String(value || "").match(/^(\d{4})/);
    return match ? Number(match[1]) : 0;
  };
  return extractStartYear(right) - extractStartYear(left);
}

function aggregateDashboard(records, options = {}) {
  const normalizedRecords = (records || []).map((record) => ({
    ...record,
    academicYearLabel: normalizeYearLabel(record.academicYearLabel),
    supportType: normalizeSupportType(record.supportType),
    currency: normalizeCurrency(record.currency)
  }));

  const summarize = (items, label) => {
    const supportMixBase = [
      { label: "Internal support", value: 0, color: "#2D7A5F", key: "internal" },
      { label: "External support", value: 0, color: "#C9A84C", key: "external" },
      { label: "Unknown / other", value: 0, color: "#4B6382", key: "unknown" }
    ];
    const mixLookup = new Map(supportMixBase.map((item) => [item.key, { ...item }]));
    const importBatches = new Set();

    for (const item of items) {
      const key = normalizeSupportType(item.supportType);
      mixLookup.get(key).value += 1;
      importBatches.add(item.importBatchReference || item.sourceFileName || item.id);
    }

    const sponsorDistribution = buildDistribution(
      items,
      (item) => item.schemeName || item.sponsorName || "Unspecified support",
      ["#2D7A5F", "#4B6382", "#C9A84C", "#B04A5A", "#2D5B9F", "#8A4F9E"]
    );
    const collegeDistribution = buildDistribution(
      items,
      (item) => item.college || "",
      ["#4B6382", "#C9A84C", "#2D7A5F", "#B04A5A", "#2D5B9F", "#8A4F9E"]
    );

    return {
      label,
      totalBeneficiaries: items.length,
      totalAmountPaidLabel: formatMoneySummary(items),
      currencyTotals: buildCurrencyTotals(items),
      importedListsCount: importBatches.size,
      waitlistPromotions: items.filter((item) => item.linkedWaitlistEntryId).length,
      cohortCounts: formatCohortCounts(items),
      collegeTaggedCount: items.filter((item) => item.college).length,
      collegesRepresentedCount: new Set(items.map((item) => item.college).filter(Boolean)).size,
      supportMix: [...mixLookup.values()].filter((item) => item.value > 0),
      sponsorDistribution,
      collegeDistribution
    };
  };

  const availableYears = [...new Set(
    normalizedRecords
      .map((item) => item.academicYearLabel)
      .filter(Boolean)
  )].sort(sortAcademicYearsDesc);

  const preferredCurrentYear = normalizeYearLabel(options.currentYearLabel);
  const currentYearLabel = preferredCurrentYear || availableYears[0] || "";
  const currentYearItems = normalizedRecords.filter(
    (item) => item.academicYearLabel === currentYearLabel
  );

  const historicalYears = availableYears.filter((label) => label !== currentYearLabel);

  return {
    currentYearLabel,
    currentYear: summarize(currentYearItems, currentYearLabel),
    previousYears: historicalYears.map((label) =>
      summarize(
        normalizedRecords.filter((item) => item.academicYearLabel === label),
        label
      )
    )
  };
}

function mapStoredRecord(record) {
  return {
    id: String(record.id),
    academicYearLabel: normalizeYearLabel(record.academicYearLabel),
    schemeName: record.schemeName || null,
    sponsorName: record.sponsorName || null,
    fullName: record.fullName || null,
    studentReferenceId: record.studentReferenceId || null,
    indexNumber: record.indexNumber || null,
    college: record.college || null,
    amountPaid: Number(record.amountPaid || 0),
    currency: normalizeCurrency(record.currency),
    supportType: normalizeSupportType(record.supportType),
    beneficiaryCohort: normalizeBeneficiaryCohort(record.beneficiaryCohort),
    carriedForwardFromPriorYear: Boolean(record.carriedForwardFromPriorYear),
    remarks: record.remarks || null,
    importMode: record.importMode || "historical_archive",
    importBatchReference: record.importBatchReference || null,
    sourceFileName: record.sourceFileName || null,
    linkedApplicationId: record.linkedApplicationId || null,
    linkedWaitlistEntryId: record.linkedWaitlistEntryId || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function filterRecords(records, filters = {}) {
  const academicYearLabel = normalizeYearLabel(filters.academicYearLabel);
  const schemeName = String(filters.schemeName || "").trim().toLowerCase();
  const college = String(filters.college || "").trim().toLowerCase();
  const supportType = String(filters.supportType || "").trim().toLowerCase();
  const importMode = String(filters.importMode || "").trim().toLowerCase();
  const query = String(filters.q || "").trim().toLowerCase();

  return records.filter((record) => {
    if (academicYearLabel && normalizeYearLabel(record.academicYearLabel) !== academicYearLabel) {
      return false;
    }
    if (schemeName && !String(record.schemeName || "").toLowerCase().includes(schemeName)) {
      return false;
    }
    if (college && !String(record.college || "").toLowerCase().includes(college)) {
      return false;
    }
    if (supportType && normalizeSupportType(record.supportType) !== supportType) {
      return false;
    }
    if (importMode && String(record.importMode || "").trim().toLowerCase() !== importMode) {
      return false;
    }
    if (query) {
      const haystack = [
        record.fullName,
        record.studentReferenceId,
        record.indexNumber,
        record.college,
        record.schemeName,
        record.sponsorName,
        record.academicYearLabel
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

function buildFilterOptions(records) {
  const academicYears = [...new Set(
    (records || [])
      .map((record) => normalizeYearLabel(record.academicYearLabel))
      .filter(Boolean)
  )].sort(sortAcademicYearsDesc);

  const schemeNames = [...new Set(
    (records || [])
      .map((record) => String(record.schemeName || "").trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));

  const colleges = [...new Set(
    (records || [])
      .map((record) => String(record.college || "").trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));

  return { academicYears, schemeNames, colleges };
}

function buildBeneficiaryDuplicateKey(record) {
  if (!record?.academicYearLabel || !record?.schemeName || !record?.studentReferenceId) {
    return "";
  }

  return [
    normalizeYearLabel(record.academicYearLabel).toLowerCase(),
    String(record.schemeName || "").trim().toLowerCase(),
    String(record.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildStudentReferenceKey(record) {
  if (!record?.studentReferenceId) {
    return "";
  }

  return String(record.studentReferenceId || "").trim().toLowerCase();
}

function buildBatchHistory(items = []) {
  const grouped = new Map();

  for (const item of items || []) {
    const batchReference = item.importBatchReference || item.sourceFileName || item.id;
    if (!grouped.has(batchReference)) {
      grouped.set(batchReference, {
        batchReference,
        fileName: item.sourceFileName || "Unknown source",
        academicYearLabel: item.academicYearLabel || "",
        schemeName: item.schemeName || "",
        importMode: item.importMode || "historical_archive",
        createdAt: item.createdAt || null,
        rowCount: 0
      });
    }

    const entry = grouped.get(batchReference);
    entry.rowCount += 1;

    if (item.createdAt && (!entry.createdAt || new Date(item.createdAt) > new Date(entry.createdAt))) {
      entry.createdAt = item.createdAt;
    }
    if (!entry.fileName && item.sourceFileName) {
      entry.fileName = item.sourceFileName;
    }
  }

  return [...grouped.values()].sort(
    (left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
  );
}

function normalizeActorLabel(actor) {
  return (
    String(actor?.fullName || "").trim() ||
    String(actor?.email || "").trim() ||
    String(actor?.userId || "").trim() ||
    "System"
  );
}

function summarizeChangedFields(before = {}, after = {}) {
  const labels = {
    academicYearLabel: "academic year",
    schemeName: "support name",
    sponsorName: "sponsor",
    fullName: "beneficiary name",
    studentReferenceId: "student reference ID",
    indexNumber: "index number",
    college: "college",
    amountPaid: "amount paid",
    currency: "currency",
    supportType: "support type",
    beneficiaryCohort: "beneficiary cohort",
    remarks: "remarks"
  };

  return Object.entries(labels)
    .filter(([key]) => {
      const left = before?.[key] ?? null;
      const right = after?.[key] ?? null;
      return String(left ?? "") !== String(right ?? "");
    })
    .map(([, label]) => label);
}

function buildAuditSnapshot(record = {}) {
  return {
    id: record.id || null,
    academicYearLabel: normalizeYearLabel(record.academicYearLabel),
    schemeName: record.schemeName || null,
    sponsorName: record.sponsorName || null,
    fullName: record.fullName || null,
    studentReferenceId: record.studentReferenceId || null,
    indexNumber: record.indexNumber || null,
    college: record.college || null,
    amountPaid: Number(record.amountPaid || 0),
    currency: normalizeCurrency(record.currency),
    supportType: normalizeSupportType(record.supportType),
    beneficiaryCohort: normalizeBeneficiaryCohort(record.beneficiaryCohort),
    carriedForwardFromPriorYear: Boolean(record.carriedForwardFromPriorYear),
    remarks: record.remarks || null,
    importMode: record.importMode || "historical_archive",
    importBatchReference: record.importBatchReference || null,
    sourceFileName: record.sourceFileName || null,
    linkedApplicationId: record.linkedApplicationId || null,
    linkedWaitlistEntryId: record.linkedWaitlistEntryId || null
  };
}

function matchesRecordHistoryScope(event = {}, record = {}) {
  if (String(event.beneficiaryId || "") === String(record.id || "")) {
    return true;
  }

  return (
    normalizeYearLabel(event.academicYearLabel) === normalizeYearLabel(record.academicYearLabel) &&
    String(event.schemeName || "").trim().toLowerCase() ===
      String(record.schemeName || "").trim().toLowerCase() &&
    String(event.studentReferenceId || "").trim().toLowerCase() ===
      String(record.studentReferenceId || "").trim().toLowerCase()
  );
}

function buildPriorYearNewLookupKey(record) {
  if (!record?.academicYearLabel || !record?.schemeName || !record?.studentReferenceId) {
    return "";
  }

  const previousAcademicYearLabel = getPreviousAcademicYearLabel(record.academicYearLabel);
  if (!previousAcademicYearLabel) {
    return "";
  }

  return [
    normalizeYearLabel(previousAcademicYearLabel).toLowerCase(),
    String(record.schemeName || "").trim().toLowerCase(),
    String(record.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildSchemeReport(records, academicYearLabel, schemeName) {
  const normalizedYear = normalizeYearLabel(academicYearLabel);
  const normalizedScheme = String(schemeName || "").trim().toLowerCase();
  const scopedItems = (records || []).filter(
    (item) =>
      normalizeYearLabel(item.academicYearLabel) === normalizedYear &&
      String(item.schemeName || "").trim().toLowerCase() === normalizedScheme
  );

  const cohortCounts = formatCohortCounts(scopedItems);
  const collegeBreakdown = [...new Set(scopedItems.map((item) => item.college).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((college) => {
      const collegeItems = scopedItems.filter((item) => item.college === college);
      return {
        college,
        beneficiaryCount: collegeItems.length,
        amountPaidLabel: formatMoneySummary(collegeItems),
        currencyTotals: buildCurrencyTotals(collegeItems),
        cohortCounts: formatCohortCounts(collegeItems)
      };
    });

  return {
    academicYearLabel: normalizedYear,
    schemeName,
    totalBeneficiaries: scopedItems.length,
    totalAmountPaidLabel: formatMoneySummary(scopedItems),
    currencyTotals: buildCurrencyTotals(scopedItems),
    collegesRepresentedCount: new Set(scopedItems.map((item) => item.college).filter(Boolean)).size,
    cohortCounts,
    collegeBreakdown,
    items: scopedItems.map((item) => ({
      ...item,
      beneficiaryCohortLabel: formatBeneficiaryCohort(item.beneficiaryCohort)
    }))
  };
}

function matchesScopedBeneficiaryDelete(record, academicYearLabel, schemeName) {
  return (
    normalizeYearLabel(record.academicYearLabel) === academicYearLabel &&
    String(record.schemeName || "").trim().toLowerCase() === schemeName
  );
}

function createSampleRepository() {
  const records = [];
  const batchLogs = [];
  const auditEvents = [];

  function addAuditEvent(event = {}) {
    auditEvents.unshift({
      id: createId("beneficiary-audit"),
      beneficiaryId: event.beneficiaryId || null,
      academicYearLabel: normalizeYearLabel(event.academicYearLabel),
      schemeName: event.schemeName || null,
      studentReferenceId: event.studentReferenceId || null,
      batchReference: event.batchReference || null,
      eventType: event.eventType || "updated",
      summary: event.summary || "Beneficiary record updated.",
      reason: event.reason || null,
      actorName: event.actorName || "System",
      snapshot: event.snapshot || null,
      createdAt: event.createdAt || new Date().toISOString()
    });
  }

  return {
    async list(filters = {}) {
      return filterRecords(records, filters)
        .map(mapStoredRecord)
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    },
    async importRows({ items, importMode, sourceFileName, actor, duplicateStrategy }) {
      const batchReference = createId("beneficiary-batch");
      const now = new Date().toISOString();
      let replacedRows = 0;
      const actorName = normalizeActorLabel(actor);
      const importedItems = items.map((item) => {
        if ((item.duplicateStrategy || duplicateStrategy) === "replace_existing") {
          for (let index = records.length - 1; index >= 0; index -= 1) {
            if (
              buildBeneficiaryDuplicateKey(records[index]) === buildBeneficiaryDuplicateKey(item)
            ) {
              const replacedRecord = mapStoredRecord(records[index]);
              addAuditEvent({
                beneficiaryId: replacedRecord.id,
                academicYearLabel: replacedRecord.academicYearLabel,
                schemeName: replacedRecord.schemeName,
                studentReferenceId: replacedRecord.studentReferenceId,
                batchReference,
                eventType: "replaced",
                summary: "Beneficiary row was replaced by a later import.",
                actorName,
                snapshot: buildAuditSnapshot(replacedRecord),
                createdAt: now
              });
              records.splice(index, 1);
              replacedRows += 1;
            }
          }
        }

        const stored = {
          id: createId("beneficiary"),
          academicYearLabel: normalizeYearLabel(item.academicYearLabel),
          schemeName: item.schemeName,
          sponsorName: item.sponsorName,
          fullName: item.fullName,
          studentReferenceId: item.studentReferenceId,
          indexNumber: item.indexNumber,
          college: item.college || null,
          amountPaid: Number(item.amountPaid || 0),
          currency: normalizeCurrency(item.currency),
          supportType: normalizeSupportType(item.supportType),
          beneficiaryCohort: normalizeBeneficiaryCohort(item.beneficiaryCohort),
          carriedForwardFromPriorYear: Boolean(item.carriedForwardFromPriorYear),
          remarks: item.remarks,
          importMode: importMode || item.importMode || "historical_archive",
          importBatchReference: batchReference,
          sourceFileName: sourceFileName || null,
          linkedApplicationId: item.linkedApplicationId || null,
          linkedWaitlistEntryId: item.linkedWaitlistEntryId || null,
          createdBy: actor?.userId || null,
          createdAt: now,
          updatedAt: now
        };
        records.unshift(stored);
        const mapped = mapStoredRecord(stored);
        addAuditEvent({
          beneficiaryId: mapped.id,
          academicYearLabel: mapped.academicYearLabel,
          schemeName: mapped.schemeName,
          studentReferenceId: mapped.studentReferenceId,
          batchReference,
          eventType: "imported",
          summary: "Beneficiary row imported.",
          actorName,
          snapshot: buildAuditSnapshot(mapped),
          createdAt: now
        });
        return mapped;
      });

      batchLogs.unshift({
        batchReference,
        fileName: sourceFileName || "Unknown source",
        academicYearLabel: importedItems[0]?.academicYearLabel || "",
        schemeName: importedItems[0]?.schemeName || "",
        importMode: importMode || "historical_archive",
        duplicateStrategy: duplicateStrategy || "skip",
        status: "active",
        rowCount: importedItems.length,
        replacedRows,
        createdAt: now,
        createdByName: actorName,
        rollbackDeletedRows: 0,
        rollbackReason: null,
        rolledBackAt: null,
        rolledBackByName: null
      });

      return {
        batchReference,
        items: importedItems,
        replacedRows
      };
    },
    async updateRecord({ id, updates, replaceExisting, reason, actor }) {
      const target = records.find((record) => String(record.id) === String(id));
      if (!target) {
        throw new Error(`Beneficiary record ${id} was not found.`);
      }

      const before = mapStoredRecord(target);
      const nextRecord = {
        ...before,
        academicYearLabel:
          updates.academicYearLabel !== undefined ? normalizeYearLabel(updates.academicYearLabel) : before.academicYearLabel,
        schemeName: updates.schemeName !== undefined ? updates.schemeName : before.schemeName,
        sponsorName: updates.sponsorName !== undefined ? updates.sponsorName : before.sponsorName,
        fullName: updates.fullName !== undefined ? updates.fullName : before.fullName,
        studentReferenceId:
          updates.studentReferenceId !== undefined ? updates.studentReferenceId : before.studentReferenceId,
        indexNumber: updates.indexNumber !== undefined ? updates.indexNumber : before.indexNumber,
        college: updates.college !== undefined ? updates.college : before.college,
        amountPaid: updates.amountPaid !== undefined ? Number(updates.amountPaid || 0) : before.amountPaid,
        currency: updates.currency !== undefined ? normalizeCurrency(updates.currency) : before.currency,
        supportType: updates.supportType !== undefined ? normalizeSupportType(updates.supportType) : before.supportType,
        beneficiaryCohort:
          updates.beneficiaryCohort !== undefined
            ? normalizeBeneficiaryCohort(updates.beneficiaryCohort)
            : before.beneficiaryCohort,
        remarks: updates.remarks !== undefined ? updates.remarks : before.remarks
      };

      const incomingDuplicateKey = buildBeneficiaryDuplicateKey(nextRecord);
      const conflictingIndex = records.findIndex(
        (record) =>
          String(record.id) !== String(id) &&
          buildBeneficiaryDuplicateKey(record) &&
          buildBeneficiaryDuplicateKey(record) === incomingDuplicateKey
      );

      if (conflictingIndex !== -1) {
        if (!replaceExisting) {
          throw new Error(
            "Another beneficiary row already uses this academic year, support name, and student reference ID. Use replace existing to continue."
          );
        }
        const replacedRecord = mapStoredRecord(records[conflictingIndex]);
        addAuditEvent({
          beneficiaryId: replacedRecord.id,
          academicYearLabel: replacedRecord.academicYearLabel,
          schemeName: replacedRecord.schemeName,
          studentReferenceId: replacedRecord.studentReferenceId,
          eventType: "replaced",
          summary: "Beneficiary row was replaced by a manual update.",
          reason,
          actorName: normalizeActorLabel(actor),
          snapshot: buildAuditSnapshot(replacedRecord)
        });
        records.splice(conflictingIndex, 1);
      }

      if (updates.academicYearLabel !== undefined) {
        target.academicYearLabel = normalizeYearLabel(updates.academicYearLabel);
      }
      if (updates.schemeName !== undefined) target.schemeName = updates.schemeName;
      if (updates.sponsorName !== undefined) target.sponsorName = updates.sponsorName || null;
      if (updates.fullName !== undefined) target.fullName = updates.fullName;
      if (updates.studentReferenceId !== undefined) {
        target.studentReferenceId = updates.studentReferenceId || null;
      }
      if (updates.indexNumber !== undefined) target.indexNumber = updates.indexNumber || null;
      if (updates.amountPaid !== undefined) target.amountPaid = Number(updates.amountPaid || 0);
      if (updates.currency !== undefined) target.currency = normalizeCurrency(updates.currency);
      if (updates.supportType !== undefined) target.supportType = normalizeSupportType(updates.supportType);
      if (updates.college !== undefined) target.college = updates.college || null;
      if (updates.remarks !== undefined) target.remarks = updates.remarks || null;
      if (updates.beneficiaryCohort !== undefined) {
        target.beneficiaryCohort = normalizeBeneficiaryCohort(updates.beneficiaryCohort);
      }
      target.updatedAt = new Date().toISOString();
      const mapped = mapStoredRecord(target);
      const changedFields = summarizeChangedFields(before, mapped);
      addAuditEvent({
        beneficiaryId: mapped.id,
        academicYearLabel: mapped.academicYearLabel,
        schemeName: mapped.schemeName,
        studentReferenceId: mapped.studentReferenceId,
        eventType: "updated",
        summary: changedFields.length
          ? `Updated ${changedFields.join(", ")}.`
          : "Beneficiary row updated.",
        reason,
        actorName: normalizeActorLabel(actor),
        snapshot: buildAuditSnapshot(mapped)
      });

      return mapped;
    },
    async deleteRecord({ id, reason, actor }) {
      const index = records.findIndex((record) => String(record.id) === String(id));
      if (index === -1) {
        return { deletedRows: 0 };
      }
      const deletedRecord = mapStoredRecord(records[index]);
      records.splice(index, 1);
      addAuditEvent({
        beneficiaryId: deletedRecord.id,
        academicYearLabel: deletedRecord.academicYearLabel,
        schemeName: deletedRecord.schemeName,
        studentReferenceId: deletedRecord.studentReferenceId,
        eventType: "deleted",
        summary: "Beneficiary row removed.",
        reason,
        actorName: normalizeActorLabel(actor),
        snapshot: buildAuditSnapshot(deletedRecord)
      });
      return { deletedRows: 1 };
    },
    async clearBySchemeAndYear({ academicYearLabel, schemeName, reason, actor }) {
      const normalizedYear = normalizeYearLabel(academicYearLabel);
      const normalizedScheme = String(schemeName || "").trim().toLowerCase();
      const beforeCount = records.length;

      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (matchesScopedBeneficiaryDelete(records[index], normalizedYear, normalizedScheme)) {
          const deletedRecord = mapStoredRecord(records[index]);
          addAuditEvent({
            beneficiaryId: deletedRecord.id,
            academicYearLabel: deletedRecord.academicYearLabel,
            schemeName: deletedRecord.schemeName,
            studentReferenceId: deletedRecord.studentReferenceId,
            eventType: "cleared",
            summary: "Beneficiary row removed by scoped scheme/year clear.",
            reason,
            actorName: normalizeActorLabel(actor),
            snapshot: buildAuditSnapshot(deletedRecord)
          });
          records.splice(index, 1);
        }
      }

      return {
        deletedRows: beforeCount - records.length
      };
    },
    async listFilterOptions() {
      return buildFilterOptions(records);
    },
    async findPriorYearNewBeneficiaryKeys(items = []) {
      const priorYearNewLookup = new Set(
        records
          .filter((record) => normalizeBeneficiaryCohort(record.beneficiaryCohort) === "new")
          .map((record) => buildBeneficiaryDuplicateKey(record))
          .filter(Boolean)
      );

      return new Set(
        (items || [])
          .filter((item) => !normalizeBeneficiaryCohort(item?.beneficiaryCohort))
          .map((item) => ({
            currentKey: buildBeneficiaryDuplicateKey(item),
            lookupKey: buildPriorYearNewLookupKey(item)
          }))
          .filter((item) => item.currentKey && item.lookupKey && priorYearNewLookup.has(item.lookupKey))
          .map((item) => item.currentKey)
      );
    },
    async findExistingDuplicateKeys(items = []) {
      const lookup = new Set(records.map((record) => buildBeneficiaryDuplicateKey(record)).filter(Boolean));
      return new Set(
        (items || [])
          .map((item) => buildBeneficiaryDuplicateKey(item))
          .filter((key) => key && lookup.has(key))
      );
    },
    async findCrossScopeDuplicateStudentIds(items = []) {
      const candidateIds = new Set(
        (items || []).map((item) => buildStudentReferenceKey(item)).filter(Boolean)
      );
      if (!candidateIds.size) {
        return new Set();
      }

      const exactKeys = new Set((items || []).map((item) => buildBeneficiaryDuplicateKey(item)).filter(Boolean));
      return new Set(
        records
          .filter((record) => {
            const studentReferenceKey = buildStudentReferenceKey(record);
            if (!studentReferenceKey || !candidateIds.has(studentReferenceKey)) {
              return false;
            }
            return !exactKeys.has(buildBeneficiaryDuplicateKey(record));
          })
          .map((record) => buildStudentReferenceKey(record))
          .filter(Boolean)
      );
    },
    async getImportHistory(filters = {}) {
      const academicYearLabel = normalizeYearLabel(filters.academicYearLabel);
      const normalizedScheme = String(filters.schemeName || "").trim().toLowerCase();
      const items = batchLogs.filter((item) => {
        if (academicYearLabel && normalizeYearLabel(item.academicYearLabel) !== academicYearLabel) {
          return false;
        }
        if (
          normalizedScheme &&
          String(item.schemeName || "").trim().toLowerCase() !== normalizedScheme
        ) {
          return false;
        }
        return true;
      });

      return {
        total: items.length,
        items
      };
    },
    async getRecordHistory({ id }) {
      const target = records.find((record) => String(record.id) === String(id));
      if (!target) {
        throw new Error(`Beneficiary record ${id} was not found.`);
      }

      const mapped = mapStoredRecord(target);
      const items = auditEvents.filter((event) => matchesRecordHistoryScope(event, mapped));
      return {
        total: items.length,
        record: mapped,
        items
      };
    },
    async getAuditFeed(filters = {}) {
      const academicYearLabel = normalizeYearLabel(filters.academicYearLabel);
      const normalizedScheme = String(filters.schemeName || "").trim().toLowerCase();
      const normalizedEventType = String(filters.eventType || "").trim().toLowerCase();
      const items = auditEvents.filter((item) => {
        if (academicYearLabel && normalizeYearLabel(item.academicYearLabel) !== academicYearLabel) {
          return false;
        }
        if (
          normalizedScheme &&
          String(item.schemeName || "").trim().toLowerCase() !== normalizedScheme
        ) {
          return false;
        }
        if (normalizedEventType && String(item.eventType || "").trim().toLowerCase() !== normalizedEventType) {
          return false;
        }
        return true;
      });

      return {
        total: items.length,
        items
      };
    },
    async rollbackBatch({ batchReference, actor, reason }) {
      const beforeCount = records.length;
      let deletedRows = 0;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (String(records[index].importBatchReference || "") === String(batchReference)) {
          const deletedRecord = mapStoredRecord(records[index]);
          addAuditEvent({
            beneficiaryId: deletedRecord.id,
            academicYearLabel: deletedRecord.academicYearLabel,
            schemeName: deletedRecord.schemeName,
            studentReferenceId: deletedRecord.studentReferenceId,
            batchReference,
            eventType: "rolled_back",
            summary: "Beneficiary row removed by import rollback.",
            reason: reason || "Batch rollback",
            actorName: normalizeActorLabel(actor),
            snapshot: buildAuditSnapshot(deletedRecord)
          });
          records.splice(index, 1);
          deletedRows += 1;
        }
      }

      const batchLog = batchLogs.find(
        (item) => String(item.batchReference || "") === String(batchReference)
      );
      if (batchLog) {
        batchLog.status = "rolled_back";
        batchLog.rollbackDeletedRows = deletedRows;
        batchLog.rollbackReason = reason || "Batch rollback";
        batchLog.rolledBackAt = new Date().toISOString();
        batchLog.rolledBackByName = normalizeActorLabel(actor);
      }

      return {
        deletedRows: beforeCount - records.length
      };
    },
    async getSchemeReport({ academicYearLabel, schemeName }) {
      return buildSchemeReport(records, academicYearLabel, schemeName);
    },
    async getDashboardData(options = {}) {
      return aggregateDashboard(records, options);
    }
  };
}

function toDatabaseUserId(actor) {
  return /^\d+$/.test(String(actor?.userId || "")) ? Number(actor.userId) : null;
}

function mapBeneficiaryRow(row) {
  return {
    id: row.id,
    academicYearLabel: normalizeYearLabel(row.academic_year_label),
    schemeName: row.scheme_name,
    sponsorName: row.sponsor_name,
    fullName: row.full_name,
    studentReferenceId: row.student_reference_id,
    indexNumber: row.index_number,
    college: row.college,
    amountPaid: Number(row.amount_paid || 0),
    currency: normalizeCurrency(row.currency),
    supportType: normalizeSupportType(row.support_type),
    beneficiaryCohort: normalizeBeneficiaryCohort(row.beneficiary_cohort),
    carriedForwardFromPriorYear: Boolean(row.carried_forward_from_prior_year),
    remarks: row.remarks,
    importMode: row.import_mode,
    importBatchReference: row.import_batch_reference,
    sourceFileName: row.source_file_name,
    linkedApplicationId: row.linked_application_id,
    linkedWaitlistEntryId: row.linked_waitlist_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBeneficiaryBatchRow(row) {
  return {
    batchReference: row.batch_reference,
    fileName: row.source_file_name || "Unknown source",
    academicYearLabel: normalizeYearLabel(row.academic_year_label),
    schemeName: row.scheme_name,
    importMode: row.import_mode,
    duplicateStrategy: row.duplicate_strategy || "skip",
    status: row.status || "active",
    rowCount: Number(row.imported_rows || 0),
    replacedRows: Number(row.replaced_rows || 0),
    createdAt: row.created_at,
    createdByName: row.created_by_name || null,
    rollbackDeletedRows: Number(row.rollback_deleted_rows || 0),
    rollbackReason: row.rollback_reason || null,
    rolledBackAt: row.rolled_back_at || null,
    rolledBackByName: row.rolled_back_by_name || null
  };
}

function mapBeneficiaryAuditEventRow(row) {
  return {
    id: String(row.id),
    beneficiaryId: row.beneficiary_id ? String(row.beneficiary_id) : null,
    academicYearLabel: normalizeYearLabel(row.academic_year_label),
    schemeName: row.scheme_name || null,
    studentReferenceId: row.student_reference_id || null,
    batchReference: row.batch_reference || null,
    eventType: row.event_type || "updated",
    summary: row.summary || "",
    reason: row.event_reason || null,
    actorName: row.actor_name || null,
    snapshot: row.snapshot || null,
    createdAt: row.created_at || null
  };
}

function createPostgresRepository(database) {
  let ensured = false;

  async function ensureTable() {
    if (ensured) return;

    await database.query(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id BIGSERIAL PRIMARY KEY,
        academic_year_label TEXT NOT NULL,
        scheme_name TEXT NOT NULL,
        sponsor_name TEXT,
        full_name TEXT NOT NULL,
        student_reference_id TEXT,
        index_number TEXT,
        college TEXT,
        amount_paid NUMERIC(12, 2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'GHS',
        support_type TEXT NOT NULL DEFAULT 'unknown',
        beneficiary_cohort TEXT,
        carried_forward_from_prior_year BOOLEAN NOT NULL DEFAULT FALSE,
        remarks TEXT,
        import_mode TEXT NOT NULL DEFAULT 'historical_archive',
        import_batch_reference TEXT,
        source_file_name TEXT,
        linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
        linked_waitlist_entry_id BIGINT REFERENCES waitlist_entries(id) ON DELETE SET NULL,
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiaries_year ON beneficiaries(academic_year_label)"
    );
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiaries_scheme ON beneficiaries(scheme_name)"
    );
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiaries_reference ON beneficiaries(student_reference_id)"
    );
    await database.query("ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS college TEXT");
    await database.query(
      "ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS beneficiary_cohort TEXT"
    );
    await database.query(
      "ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS carried_forward_from_prior_year BOOLEAN NOT NULL DEFAULT FALSE"
    );
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiaries_college ON beneficiaries(college)"
    );
    await database.query(`
      CREATE TABLE IF NOT EXISTS beneficiary_import_batches (
        id BIGSERIAL PRIMARY KEY,
        batch_reference TEXT NOT NULL UNIQUE,
        academic_year_label TEXT NOT NULL,
        scheme_name TEXT NOT NULL,
        source_file_name TEXT,
        import_mode TEXT NOT NULL DEFAULT 'historical_archive',
        duplicate_strategy TEXT NOT NULL DEFAULT 'skip',
        imported_rows INTEGER NOT NULL DEFAULT 0,
        replaced_rows INTEGER NOT NULL DEFAULT 0,
        categorized_by_college BOOLEAN NOT NULL DEFAULT FALSE,
        beneficiary_cohort TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by BIGINT REFERENCES users(id),
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rollback_deleted_rows INTEGER NOT NULL DEFAULT 0,
        rollback_reason TEXT,
        rolled_back_by BIGINT REFERENCES users(id),
        rolled_back_by_name TEXT,
        rolled_back_at TIMESTAMPTZ
      )
    `);
    await database.query(`
      CREATE TABLE IF NOT EXISTS beneficiary_audit_events (
        id BIGSERIAL PRIMARY KEY,
        beneficiary_id BIGINT,
        academic_year_label TEXT NOT NULL,
        scheme_name TEXT NOT NULL,
        student_reference_id TEXT,
        batch_reference TEXT,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        event_reason TEXT,
        actor_user_id BIGINT REFERENCES users(id),
        actor_name TEXT,
        snapshot JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiary_import_batches_scope ON beneficiary_import_batches(academic_year_label, scheme_name, created_at DESC)"
    );
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiary_audit_scope ON beneficiary_audit_events(academic_year_label, scheme_name, student_reference_id, created_at DESC)"
    );
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_beneficiary_audit_record ON beneficiary_audit_events(beneficiary_id, created_at DESC)"
    );

    ensured = true;
  }

  async function recordAuditEvent(transaction, event = {}) {
    await transaction.query(
      `
        INSERT INTO beneficiary_audit_events (
          beneficiary_id,
          academic_year_label,
          scheme_name,
          student_reference_id,
          batch_reference,
          event_type,
          summary,
          event_reason,
          actor_user_id,
          actor_name,
          snapshot
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      `,
      [
        event.beneficiaryId ? Number(event.beneficiaryId) : null,
        normalizeYearLabel(event.academicYearLabel),
        event.schemeName || "",
        event.studentReferenceId || null,
        event.batchReference || null,
        event.eventType || "updated",
        event.summary || "Beneficiary record updated.",
        event.reason || null,
        toDatabaseUserId(event.actor),
        normalizeActorLabel(event.actor),
        JSON.stringify(event.snapshot || null)
      ]
    );
  }

  return {
    async list(filters = {}) {
      await ensureTable();

      const conditions = [];
      const params = [];
      const academicYearLabel = normalizeYearLabel(filters.academicYearLabel);
      const schemeName = String(filters.schemeName || "").trim();
      const college = String(filters.college || "").trim();
      const supportType = String(filters.supportType || "").trim().toLowerCase();
      const importMode = String(filters.importMode || "").trim().toLowerCase();
      const query = String(filters.q || "").trim();

      if (academicYearLabel) {
        params.push(academicYearLabel);
        conditions.push(`beneficiaries.academic_year_label = $${params.length}`);
      }
      if (schemeName) {
        params.push(`%${schemeName}%`);
        conditions.push(`beneficiaries.scheme_name ILIKE $${params.length}`);
      }
      if (college) {
        params.push(`%${college}%`);
        conditions.push(`COALESCE(beneficiaries.college, '') ILIKE $${params.length}`);
      }
      if (supportType) {
        params.push(supportType);
        conditions.push(`LOWER(beneficiaries.support_type) = $${params.length}`);
      }
      if (importMode) {
        params.push(importMode);
        conditions.push(`LOWER(beneficiaries.import_mode) = $${params.length}`);
      }
      if (query) {
        params.push(`%${query}%`);
        conditions.push(`(
          beneficiaries.full_name ILIKE $${params.length}
          OR COALESCE(beneficiaries.student_reference_id, '') ILIKE $${params.length}
          OR COALESCE(beneficiaries.index_number, '') ILIKE $${params.length}
          OR COALESCE(beneficiaries.college, '') ILIKE $${params.length}
          OR beneficiaries.scheme_name ILIKE $${params.length}
          OR COALESCE(beneficiaries.sponsor_name, '') ILIKE $${params.length}
          OR beneficiaries.academic_year_label ILIKE $${params.length}
        )`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(
        `
          SELECT
            beneficiaries.id::text AS id,
            beneficiaries.academic_year_label,
            beneficiaries.scheme_name,
            beneficiaries.sponsor_name,
            beneficiaries.full_name,
            beneficiaries.student_reference_id,
            beneficiaries.index_number,
            beneficiaries.college,
            beneficiaries.amount_paid,
            beneficiaries.currency,
            beneficiaries.support_type,
            beneficiaries.beneficiary_cohort,
            beneficiaries.carried_forward_from_prior_year,
            beneficiaries.remarks,
            beneficiaries.import_mode,
            beneficiaries.import_batch_reference,
            beneficiaries.source_file_name,
            beneficiaries.linked_application_id::text AS linked_application_id,
            beneficiaries.linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
            beneficiaries.created_at,
            beneficiaries.updated_at
          FROM beneficiaries
          ${whereClause}
          ORDER BY beneficiaries.created_at DESC, beneficiaries.id DESC
        `,
        params
      );

      return result.rows.map(mapBeneficiaryRow);
    },
    async importRows({
      items,
      importMode,
      sourceFileName,
      actor,
      duplicateStrategy,
      categorizedByCollege,
      beneficiaryCohort
    }) {
      await ensureTable();

      const batchReference = createId("beneficiary-batch");
      const actorUserId = toDatabaseUserId(actor);
      const actorName = normalizeActorLabel(actor);
      let replacedRows = 0;
      const importedItems = await database.withTransaction(async (transaction) => {
        const rows = [];
        for (const item of items) {
          if ((item.duplicateStrategy || duplicateStrategy) === "replace_existing") {
            const existingRows = await transaction.query(
              `
                SELECT
                  id::text AS id,
                  academic_year_label,
                  scheme_name,
                  sponsor_name,
                  full_name,
                  student_reference_id,
                  index_number,
                  college,
                  amount_paid,
                  currency,
                  support_type,
                  beneficiary_cohort,
                  carried_forward_from_prior_year,
                  remarks,
                  import_mode,
                  import_batch_reference,
                  source_file_name,
                  linked_application_id::text AS linked_application_id,
                  linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
                  created_at,
                  updated_at
                FROM beneficiaries
                WHERE LOWER(TRIM(academic_year_label)) = LOWER(TRIM($1))
                  AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
                  AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM($3))
              `,
              [
                normalizeYearLabel(item.academicYearLabel),
                String(item.schemeName || "").trim(),
                String(item.studentReferenceId || "").trim()
              ]
            );
            const deleteResult = await transaction.query(
              `
                DELETE FROM beneficiaries
                WHERE LOWER(TRIM(academic_year_label)) = LOWER(TRIM($1))
                  AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
                  AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM($3))
              `,
              [
                normalizeYearLabel(item.academicYearLabel),
                String(item.schemeName || "").trim(),
                String(item.studentReferenceId || "").trim()
              ]
            );
            replacedRows += Number(deleteResult.rowCount || 0);
            for (const existingRow of existingRows.rows) {
              const mappedExisting = mapBeneficiaryRow(existingRow);
              await recordAuditEvent(transaction, {
                beneficiaryId: mappedExisting.id,
                academicYearLabel: mappedExisting.academicYearLabel,
                schemeName: mappedExisting.schemeName,
                studentReferenceId: mappedExisting.studentReferenceId,
                batchReference,
                eventType: "replaced",
                summary: "Beneficiary row was replaced by a later import.",
                actor,
                snapshot: buildAuditSnapshot(mappedExisting)
              });
            }
          }

          const result = await transaction.query(
            `
              INSERT INTO beneficiaries (
                academic_year_label,
                scheme_name,
                sponsor_name,
                full_name,
                student_reference_id,
                index_number,
                college,
                amount_paid,
                currency,
                support_type,
                beneficiary_cohort,
                carried_forward_from_prior_year,
                remarks,
                import_mode,
                import_batch_reference,
                source_file_name,
                linked_application_id,
                linked_waitlist_entry_id,
                created_by
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14
                ,
                $15,
                $16,
                $17,
                $18,
                $19
              )
              RETURNING
                id::text AS id,
                academic_year_label,
                scheme_name,
                sponsor_name,
                full_name,
                student_reference_id,
                index_number,
                college,
                amount_paid,
                currency,
                support_type,
                beneficiary_cohort,
                carried_forward_from_prior_year,
                remarks,
                import_mode,
                import_batch_reference,
                source_file_name,
                linked_application_id::text AS linked_application_id,
                linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
                created_at,
                updated_at
            `,
            [
              normalizeYearLabel(item.academicYearLabel),
              item.schemeName,
              item.sponsorName || null,
              item.fullName,
              item.studentReferenceId || null,
              item.indexNumber || null,
              item.college || null,
              Number(item.amountPaid || 0),
              normalizeCurrency(item.currency),
              normalizeSupportType(item.supportType),
              normalizeBeneficiaryCohort(item.beneficiaryCohort),
              Boolean(item.carriedForwardFromPriorYear),
              item.remarks || null,
              importMode || item.importMode || "historical_archive",
              batchReference,
              sourceFileName || null,
              item.linkedApplicationId || null,
              item.linkedWaitlistEntryId || null,
              actorUserId
            ]
          );
          const mapped = mapBeneficiaryRow(result.rows[0]);
          rows.push(mapped);
          await recordAuditEvent(transaction, {
            beneficiaryId: mapped.id,
            academicYearLabel: mapped.academicYearLabel,
            schemeName: mapped.schemeName,
            studentReferenceId: mapped.studentReferenceId,
            batchReference,
            eventType: "imported",
            summary: "Beneficiary row imported.",
            actor,
            snapshot: buildAuditSnapshot(mapped)
          });
        }
        if (rows.length) {
          await transaction.query(
            `
              INSERT INTO beneficiary_import_batches (
                batch_reference,
                academic_year_label,
                scheme_name,
                source_file_name,
                import_mode,
                duplicate_strategy,
                imported_rows,
                replaced_rows,
                categorized_by_college,
                beneficiary_cohort,
                created_by,
                created_by_name
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            `,
            [
              batchReference,
              rows[0].academicYearLabel,
              rows[0].schemeName,
              sourceFileName || null,
              importMode || "historical_archive",
              duplicateStrategy || "skip",
              rows.length,
              replacedRows,
              Boolean(categorizedByCollege),
              normalizeBeneficiaryCohort(beneficiaryCohort),
              actorUserId,
              actorName
            ]
          );
        }
        return rows;
      });

      return {
        batchReference,
        items: importedItems,
        replacedRows
      };
    },
    async updateRecord({ id, updates, replaceExisting, reason, actor }) {
      await ensureTable();

      return database.withTransaction(async (transaction) => {
        const currentResult = await transaction.query(
          `
            SELECT
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
            FROM beneficiaries
            WHERE id::text = $1
          `,
          [String(id)]
        );

        if (!currentResult.rows.length) {
          throw new Error(`Beneficiary record ${id} was not found.`);
        }

        const before = mapBeneficiaryRow(currentResult.rows[0]);
        const next = {
          ...before,
          academicYearLabel:
            updates.academicYearLabel !== undefined ? normalizeYearLabel(updates.academicYearLabel) : before.academicYearLabel,
          schemeName: updates.schemeName !== undefined ? updates.schemeName : before.schemeName,
          sponsorName: updates.sponsorName !== undefined ? updates.sponsorName : before.sponsorName,
          fullName: updates.fullName !== undefined ? updates.fullName : before.fullName,
          studentReferenceId:
            updates.studentReferenceId !== undefined ? updates.studentReferenceId : before.studentReferenceId,
          indexNumber: updates.indexNumber !== undefined ? updates.indexNumber : before.indexNumber,
          college: updates.college !== undefined ? updates.college : before.college,
          amountPaid: updates.amountPaid !== undefined ? Number(updates.amountPaid || 0) : before.amountPaid,
          currency: updates.currency !== undefined ? normalizeCurrency(updates.currency) : before.currency,
          supportType: updates.supportType !== undefined ? normalizeSupportType(updates.supportType) : before.supportType,
          beneficiaryCohort:
            updates.beneficiaryCohort !== undefined
              ? normalizeBeneficiaryCohort(updates.beneficiaryCohort)
              : before.beneficiaryCohort,
          remarks: updates.remarks !== undefined ? updates.remarks : before.remarks
        };

        const conflictResult = await transaction.query(
          `
            SELECT
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
            FROM beneficiaries
            WHERE id::text <> $1
              AND LOWER(TRIM(academic_year_label)) = LOWER(TRIM($2))
              AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($3))
              AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM($4))
          `,
          [String(id), next.academicYearLabel, next.schemeName, next.studentReferenceId || ""]
        );

        if (conflictResult.rows.length) {
          if (!replaceExisting) {
            throw new Error(
              "Another beneficiary row already uses this academic year, support name, and student reference ID. Use replace existing to continue."
            );
          }
          for (const row of conflictResult.rows) {
            const mappedConflict = mapBeneficiaryRow(row);
            await transaction.query(`DELETE FROM beneficiaries WHERE id::text = $1`, [mappedConflict.id]);
            await recordAuditEvent(transaction, {
            beneficiaryId: mappedConflict.id,
            academicYearLabel: mappedConflict.academicYearLabel,
            schemeName: mappedConflict.schemeName,
            studentReferenceId: mappedConflict.studentReferenceId,
            eventType: "replaced",
            summary: "Beneficiary row was replaced by a manual update.",
            reason,
            actor,
            snapshot: buildAuditSnapshot(mappedConflict)
          });
          }
        }

        const result = await transaction.query(
          `
            UPDATE beneficiaries
            SET
              academic_year_label = $1,
              scheme_name = $2,
              sponsor_name = $3,
              full_name = $4,
              student_reference_id = $5,
              index_number = $6,
              college = $7,
              amount_paid = $8,
              currency = $9,
              support_type = $10,
              beneficiary_cohort = $11,
              remarks = $12,
              updated_at = NOW()
            WHERE id::text = $13
            RETURNING
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
          `,
          [
            next.academicYearLabel,
            next.schemeName,
            next.sponsorName || null,
            next.fullName,
            next.studentReferenceId || null,
            next.indexNumber || null,
            next.college || null,
            Number(next.amountPaid || 0),
            normalizeCurrency(next.currency),
            normalizeSupportType(next.supportType),
            normalizeBeneficiaryCohort(next.beneficiaryCohort),
            next.remarks || null,
            String(id)
          ]
        );

        const mapped = mapBeneficiaryRow(result.rows[0]);
        const changedFields = summarizeChangedFields(before, mapped);
        await recordAuditEvent(transaction, {
          beneficiaryId: mapped.id,
          academicYearLabel: mapped.academicYearLabel,
          schemeName: mapped.schemeName,
          studentReferenceId: mapped.studentReferenceId,
          eventType: "updated",
          summary: changedFields.length
            ? `Updated ${changedFields.join(", ")}.`
            : "Beneficiary row updated.",
          reason,
          actor,
          snapshot: buildAuditSnapshot(mapped)
        });

        return mapped;
      });
    },
    async deleteRecord({ id, reason, actor }) {
      await ensureTable();

      return database.withTransaction(async (transaction) => {
        const lookup = await transaction.query(
          `
            SELECT
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
            FROM beneficiaries
            WHERE id::text = $1
          `,
          [String(id)]
        );
        if (!lookup.rows.length) {
          return { deletedRows: 0 };
        }
        const mapped = mapBeneficiaryRow(lookup.rows[0]);
        const result = await transaction.query(`DELETE FROM beneficiaries WHERE id::text = $1`, [String(id)]);
        await recordAuditEvent(transaction, {
          beneficiaryId: mapped.id,
          academicYearLabel: mapped.academicYearLabel,
          schemeName: mapped.schemeName,
          studentReferenceId: mapped.studentReferenceId,
          batchReference: mapped.importBatchReference,
          eventType: "deleted",
          summary: "Beneficiary row removed.",
          reason,
          actor,
          snapshot: buildAuditSnapshot(mapped)
        });
        return { deletedRows: Number(result.rowCount || 0) };
      });
    },
    async clearBySchemeAndYear({ academicYearLabel, schemeName, reason, actor }) {
      await ensureTable();

      return database.withTransaction(async (transaction) => {
        const lookup = await transaction.query(
          `
            SELECT
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
            FROM beneficiaries
            WHERE academic_year_label = $1
              AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
          `,
          [normalizeYearLabel(academicYearLabel), String(schemeName || "").trim()]
        );
        const result = await transaction.query(
          `
            DELETE FROM beneficiaries
            WHERE academic_year_label = $1
              AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
          `,
          [normalizeYearLabel(academicYearLabel), String(schemeName || "").trim()]
        );
        for (const row of lookup.rows) {
          const mapped = mapBeneficiaryRow(row);
          await recordAuditEvent(transaction, {
            beneficiaryId: mapped.id,
            academicYearLabel: mapped.academicYearLabel,
            schemeName: mapped.schemeName,
            studentReferenceId: mapped.studentReferenceId,
            batchReference: mapped.importBatchReference,
            eventType: "cleared",
            summary: "Beneficiary row removed by scoped scheme/year clear.",
            reason,
            actor,
            snapshot: buildAuditSnapshot(mapped)
          });
        }
        return { deletedRows: Number(result.rowCount || 0) };
      });
    },
    async listFilterOptions() {
      await ensureTable();
      const result = await database.query(
        `
          SELECT DISTINCT academic_year_label, scheme_name, college
          FROM beneficiaries
          ORDER BY academic_year_label DESC, scheme_name ASC, college ASC
        `
      );

      return buildFilterOptions(
        result.rows.map((row) => ({
          academicYearLabel: row.academic_year_label,
          schemeName: row.scheme_name,
          college: row.college
        }))
      );
    },
    async findPriorYearNewBeneficiaryKeys(items = []) {
      await ensureTable();

      const normalizedItems = [...new Set(
        (items || [])
          .filter((item) => !normalizeBeneficiaryCohort(item?.beneficiaryCohort))
          .map((item) => {
            const currentKey = buildBeneficiaryDuplicateKey(item);
            const previousAcademicYearLabel = getPreviousAcademicYearLabel(item?.academicYearLabel);
            if (!currentKey || !previousAcademicYearLabel) {
              return "";
            }
            return [
              currentKey,
              normalizeYearLabel(previousAcademicYearLabel),
              String(item.schemeName || "").trim(),
              String(item.studentReferenceId || "").trim()
            ].join("||");
          })
          .filter(Boolean)
      )].map((value) => {
        const [currentKey, academicYearLabel, schemeName, studentReferenceId] = value.split("||");
        return {
          currentKey,
          academicYearLabel,
          schemeName,
          studentReferenceId
        };
      });

      if (!normalizedItems.length) {
        return new Set();
      }

      const conditions = [];
      const params = [];
      for (const item of normalizedItems) {
        params.push(item.academicYearLabel);
        const yearParam = `$${params.length}`;
        params.push(item.schemeName);
        const schemeParam = `$${params.length}`;
        params.push(item.studentReferenceId);
        const referenceParam = `$${params.length}`;

        conditions.push(
          `(LOWER(TRIM(academic_year_label)) = LOWER(TRIM(${yearParam})) AND LOWER(TRIM(scheme_name)) = LOWER(TRIM(${schemeParam})) AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM(${referenceParam})) AND LOWER(TRIM(COALESCE(beneficiary_cohort, ''))) = 'new')`
        );
      }

      const result = await database.query(
        `
          SELECT academic_year_label, scheme_name, student_reference_id
          FROM beneficiaries
          WHERE ${conditions.join(" OR ")}
        `,
        params
      );

      const matchedLookupKeys = new Set(
        result.rows
          .map((row) =>
            buildBeneficiaryDuplicateKey({
              academicYearLabel: row.academic_year_label,
              schemeName: row.scheme_name,
              studentReferenceId: row.student_reference_id
            })
          )
          .filter(Boolean)
      );

      return new Set(
        normalizedItems
          .filter((item) =>
            matchedLookupKeys.has(
              buildBeneficiaryDuplicateKey({
                academicYearLabel: item.academicYearLabel,
                schemeName: item.schemeName,
                studentReferenceId: item.studentReferenceId
              })
            )
          )
          .map((item) => item.currentKey)
      );
    },
    async findExistingDuplicateKeys(items = []) {
      await ensureTable();

      const normalizedItems = [...new Set(
        (items || [])
          .map((item) => buildBeneficiaryDuplicateKey(item))
          .filter(Boolean)
      )].map((key) => {
        const [academicYearLabel, schemeName, studentReferenceId] = key.split("::");
        return {
          academicYearLabel,
          schemeName,
          studentReferenceId
        };
      });

      if (!normalizedItems.length) {
        return new Set();
      }

      const conditions = [];
      const params = [];
      for (const item of normalizedItems) {
        params.push(normalizeYearLabel(item.academicYearLabel));
        const yearParam = `$${params.length}`;
        params.push(String(item.schemeName || "").trim());
        const schemeParam = `$${params.length}`;
        params.push(String(item.studentReferenceId || "").trim());
        const referenceParam = `$${params.length}`;

        conditions.push(
          `(LOWER(TRIM(academic_year_label)) = LOWER(TRIM(${yearParam})) AND LOWER(TRIM(scheme_name)) = LOWER(TRIM(${schemeParam})) AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM(${referenceParam})))`
        );
      }

      const result = await database.query(
        `
          SELECT academic_year_label, scheme_name, student_reference_id
          FROM beneficiaries
          WHERE ${conditions.join(" OR ")}
        `,
        params
      );

      return new Set(
        result.rows
          .map((row) =>
            buildBeneficiaryDuplicateKey({
              academicYearLabel: row.academic_year_label,
              schemeName: row.scheme_name,
              studentReferenceId: row.student_reference_id
            })
          )
          .filter(Boolean)
      );
    },
    async findCrossScopeDuplicateStudentIds(items = []) {
      await ensureTable();

      const studentReferenceIds = [...new Set(
        (items || [])
          .map((item) => buildStudentReferenceKey(item))
          .filter(Boolean)
      )];

      if (!studentReferenceIds.length) {
        return new Set();
      }

      const exactKeys = new Set(
        (items || []).map((item) => buildBeneficiaryDuplicateKey(item)).filter(Boolean)
      );
      const result = await database.query(
        `
          SELECT academic_year_label, scheme_name, student_reference_id
          FROM beneficiaries
          WHERE LOWER(TRIM(COALESCE(student_reference_id, ''))) = ANY($1)
        `,
        [studentReferenceIds]
      );

      return new Set(
        result.rows
          .filter((row) => {
            const exactKey = buildBeneficiaryDuplicateKey({
              academicYearLabel: row.academic_year_label,
              schemeName: row.scheme_name,
              studentReferenceId: row.student_reference_id
            });
            return exactKey && !exactKeys.has(exactKey);
          })
          .map((row) => buildStudentReferenceKey({ studentReferenceId: row.student_reference_id }))
          .filter(Boolean)
      );
    },
    async getImportHistory(filters = {}) {
      await ensureTable();

      const conditions = [];
      const params = [];
      if (filters.academicYearLabel) {
        params.push(normalizeYearLabel(filters.academicYearLabel));
        conditions.push(`academic_year_label = $${params.length}`);
      }
      if (filters.schemeName) {
        params.push(String(filters.schemeName || "").trim());
        conditions.push(`LOWER(TRIM(scheme_name)) = LOWER(TRIM($${params.length}))`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(
        `
          SELECT
            batch_reference,
            academic_year_label,
            scheme_name,
            source_file_name,
            import_mode,
            duplicate_strategy,
            imported_rows,
            replaced_rows,
            status,
            created_by_name,
            created_at,
            rollback_deleted_rows,
            rollback_reason,
            rolled_back_by_name,
            rolled_back_at
          FROM beneficiary_import_batches
          ${whereClause}
          ORDER BY created_at DESC, id DESC
        `,
        params
      );

      return {
        total: result.rows.length,
        items: result.rows.map(mapBeneficiaryBatchRow)
      };
    },
    async getRecordHistory({ id }) {
      await ensureTable();

      const current = await database.query(
        `
          SELECT
            id::text AS id,
            academic_year_label,
            scheme_name,
            sponsor_name,
            full_name,
            student_reference_id,
            index_number,
            college,
            amount_paid,
            currency,
            support_type,
            beneficiary_cohort,
            carried_forward_from_prior_year,
            remarks,
            import_mode,
            import_batch_reference,
            source_file_name,
            linked_application_id::text AS linked_application_id,
            linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
            created_at,
            updated_at
          FROM beneficiaries
          WHERE id::text = $1
        `,
        [String(id)]
      );
      if (!current.rows.length) {
        throw new Error(`Beneficiary record ${id} was not found.`);
      }
      const record = mapBeneficiaryRow(current.rows[0]);
      const result = await database.query(
        `
          SELECT
            id,
            beneficiary_id,
            academic_year_label,
            scheme_name,
            student_reference_id,
            batch_reference,
            event_type,
            summary,
            event_reason,
            actor_name,
            snapshot,
            created_at
          FROM beneficiary_audit_events
          WHERE beneficiary_id::text = $1
             OR (
               academic_year_label = $2
               AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($3))
               AND LOWER(TRIM(COALESCE(student_reference_id, ''))) = LOWER(TRIM($4))
             )
          ORDER BY created_at DESC, id DESC
        `,
        [String(id), record.academicYearLabel, record.schemeName, record.studentReferenceId || ""]
      );
      return {
        total: result.rows.length,
        record,
        items: result.rows.map(mapBeneficiaryAuditEventRow)
      };
    },
    async getAuditFeed(filters = {}) {
      await ensureTable();

      const conditions = [];
      const params = [];
      if (filters.academicYearLabel) {
        params.push(normalizeYearLabel(filters.academicYearLabel));
        conditions.push(`academic_year_label = $${params.length}`);
      }
      if (filters.schemeName) {
        params.push(String(filters.schemeName || "").trim());
        conditions.push(`LOWER(TRIM(scheme_name)) = LOWER(TRIM($${params.length}))`);
      }
      if (filters.eventType) {
        params.push(String(filters.eventType || "").trim().toLowerCase());
        conditions.push(`LOWER(TRIM(event_type)) = LOWER(TRIM($${params.length}))`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(
        `
          SELECT
            id,
            beneficiary_id,
            academic_year_label,
            scheme_name,
            student_reference_id,
            batch_reference,
            event_type,
            summary,
            event_reason,
            actor_name,
            snapshot,
            created_at
          FROM beneficiary_audit_events
          ${whereClause}
          ORDER BY created_at DESC, id DESC
          LIMIT 120
        `,
        params
      );

      return {
        total: result.rows.length,
        items: result.rows.map(mapBeneficiaryAuditEventRow)
      };
    },
    async rollbackBatch({ batchReference, actor, reason }) {
      await ensureTable();

      return database.withTransaction(async (transaction) => {
        const batchResult = await transaction.query(
          `SELECT * FROM beneficiary_import_batches WHERE batch_reference = $1`,
          [String(batchReference)]
        );
        if (!batchResult.rows.length) {
          return { deletedRows: 0 };
        }
        const batch = mapBeneficiaryBatchRow(batchResult.rows[0]);
        if (batch.status === "rolled_back") {
          return { deletedRows: 0 };
        }
        const latestActive = await transaction.query(
          `
            SELECT batch_reference
            FROM beneficiary_import_batches
            WHERE academic_year_label = $1
              AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
              AND status = 'active'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `,
          [batch.academicYearLabel, batch.schemeName]
        );
        if (
          latestActive.rows[0] &&
          String(latestActive.rows[0].batch_reference) !== String(batchReference)
        ) {
          throw new Error("Only the latest active import batch can be rolled back.");
        }

        const lookup = await transaction.query(
          `
            SELECT
              id::text AS id,
              academic_year_label,
              scheme_name,
              sponsor_name,
              full_name,
              student_reference_id,
              index_number,
              college,
              amount_paid,
              currency,
              support_type,
              beneficiary_cohort,
              carried_forward_from_prior_year,
              remarks,
              import_mode,
              import_batch_reference,
              source_file_name,
              linked_application_id::text AS linked_application_id,
              linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
              created_at,
              updated_at
            FROM beneficiaries
            WHERE import_batch_reference = $1
          `,
          [String(batchReference)]
        );
        const result = await transaction.query(
          `DELETE FROM beneficiaries WHERE import_batch_reference = $1`,
          [String(batchReference)]
        );
        for (const row of lookup.rows) {
          const mapped = mapBeneficiaryRow(row);
          await recordAuditEvent(transaction, {
            beneficiaryId: mapped.id,
            academicYearLabel: mapped.academicYearLabel,
            schemeName: mapped.schemeName,
            studentReferenceId: mapped.studentReferenceId,
            batchReference,
            eventType: "rolled_back",
            summary: "Beneficiary row removed by import rollback.",
            reason: reason || "Batch rollback",
            actor,
            snapshot: buildAuditSnapshot(mapped)
          });
        }
        await transaction.query(
          `
            UPDATE beneficiary_import_batches
            SET
              status = 'rolled_back',
              rollback_deleted_rows = $2,
              rollback_reason = $3,
              rolled_back_by = $4,
              rolled_back_by_name = $5,
              rolled_back_at = NOW()
            WHERE batch_reference = $1
          `,
          [
            String(batchReference),
            Number(result.rowCount || 0),
            reason || "Batch rollback",
            toDatabaseUserId(actor),
            normalizeActorLabel(actor)
          ]
        );
        return { deletedRows: Number(result.rowCount || 0) };
      });
    },
    async getSchemeReport({ academicYearLabel, schemeName }) {
      await ensureTable();
      const result = await database.query(
        `
          SELECT
            id::text AS id,
            academic_year_label,
            scheme_name,
            sponsor_name,
            full_name,
            student_reference_id,
            index_number,
            college,
            amount_paid,
            currency,
            support_type,
            beneficiary_cohort,
            carried_forward_from_prior_year,
            remarks,
            import_mode,
            import_batch_reference,
            source_file_name,
            linked_application_id::text AS linked_application_id,
            linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
            created_at,
            updated_at
          FROM beneficiaries
          WHERE academic_year_label = $1
            AND LOWER(TRIM(scheme_name)) = LOWER(TRIM($2))
          ORDER BY created_at DESC, id DESC
        `,
        [normalizeYearLabel(academicYearLabel), String(schemeName || "").trim()]
      );

      return buildSchemeReport(result.rows.map(mapBeneficiaryRow), academicYearLabel, schemeName);
    },
    async getDashboardData(options = {}) {
      await ensureTable();
      const result = await database.query(
        `
          SELECT
            id::text AS id,
            academic_year_label,
            scheme_name,
            sponsor_name,
            full_name,
            student_reference_id,
            index_number,
            college,
            amount_paid,
            currency,
            support_type,
            beneficiary_cohort,
            carried_forward_from_prior_year,
            remarks,
            import_mode,
            import_batch_reference,
            source_file_name,
            linked_application_id::text AS linked_application_id,
            linked_waitlist_entry_id::text AS linked_waitlist_entry_id,
            created_at,
            updated_at
          FROM beneficiaries
        `
      );
      return aggregateDashboard(result.rows.map(mapBeneficiaryRow), options);
    }
  };
}

export function createBeneficiaryRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
