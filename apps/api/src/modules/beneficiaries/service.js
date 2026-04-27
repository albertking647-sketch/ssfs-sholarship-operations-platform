import { ValidationError } from "../../lib/errors.js";
import { buildBeneficiaryImportPreview } from "./import.js";

const VALID_IMPORT_MODES = new Set(["current_cycle_linked", "historical_archive"]);
const VALID_DUPLICATE_STRATEGIES = new Set(["skip", "import_anyway", "replace_existing"]);

function normalizeImportMode(value) {
  const mode = String(value || "").trim().toLowerCase() || "historical_archive";
  if (!VALID_IMPORT_MODES.has(mode)) {
    throw new ValidationError("Choose a valid beneficiary import mode.");
  }
  return mode;
}

function normalizeDuplicateStrategy(value, allowDuplicates = false) {
  const fallback = allowDuplicates ? "import_anyway" : "skip";
  const strategy = String(value || "").trim().toLowerCase() || fallback;
  if (!VALID_DUPLICATE_STRATEGIES.has(strategy)) {
    throw new ValidationError("Choose a valid duplicate action.");
  }
  return strategy;
}

function buildBeneficiaryDuplicateKey(payload = {}) {
  if (!payload.academicYearLabel || !payload.schemeName || !payload.studentReferenceId) {
    return "";
  }

  return [
    String(payload.academicYearLabel || "").trim().toLowerCase(),
    String(payload.schemeName || "").trim().toLowerCase(),
    String(payload.studentReferenceId || "").trim().toLowerCase()
  ].join("::");
}

function buildDuplicateKeySet(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const key = buildBeneficiaryDuplicateKey(row.payload || row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function buildCrossScopeStudentIdSet(rows = []) {
  const scopes = new Map();

  for (const row of rows || []) {
    const payload = row.payload || row;
    const studentReferenceId = normalizeLookupValue(payload.studentReferenceId);
    const duplicateKey = buildBeneficiaryDuplicateKey(payload);
    if (!studentReferenceId || !duplicateKey) continue;
    if (!scopes.has(studentReferenceId)) {
      scopes.set(studentReferenceId, new Set());
    }
    scopes.get(studentReferenceId).add(duplicateKey);
  }

  return new Set(
    [...scopes.entries()]
      .filter(([, keys]) => keys.size > 1)
      .map(([studentReferenceId]) => studentReferenceId)
  );
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function getAcademicYearStart(value) {
  const match = normalizeAcademicYearLabel(value).match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "internal" || text === "external") return text;
  return "unknown";
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase() || "GHS";
}

function normalizeBeneficiaryCohort(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "not applicable" || text === "not_applicable" || text === "none") {
    return null;
  }
  if (text.includes("current")) return "current";
  if (text.includes("new")) return "new";
  return null;
}

function buildBeneficiaryWaitlistLookupKey(payload = {}) {
  const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel || payload.cycleLabel);
  const schemeName = String(payload.schemeName || "").trim();
  const studentReferenceId = String(payload.studentReferenceId || "").trim();

  if (!academicYearLabel || !schemeName || !studentReferenceId) {
    return "";
  }

  return [
    normalizeLookupValue(academicYearLabel),
    normalizeLookupValue(schemeName),
    normalizeLookupValue(studentReferenceId)
  ].join("::");
}

function summarizeBeneficiaryCohorts(items = []) {
  const totals = {
    current: 0,
    new: 0,
    untagged: 0,
    carriedForward: 0
  };

  for (const item of items) {
    if (item?.beneficiaryCohort === "current") totals.current += 1;
    else if (item?.beneficiaryCohort === "new") totals.new += 1;
    else totals.untagged += 1;

    if (item?.carriedForwardFromPriorYear) {
      totals.carriedForward += 1;
    }
  }

  return totals;
}

async function resolveCurrentBeneficiaryYearLabel(repositories) {
  const activeSchemes = (await repositories.schemes.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  if (activeSchemes.length) {
    return activeSchemes[0];
  }

  const activeCycles = (await repositories.cycles.list())
    .filter((item) => String(item.status || "active").toLowerCase() === "active")
    .map((item) => normalizeAcademicYearLabel(item.label || item.academicYearLabel))
    .filter(Boolean)
    .sort((left, right) => getAcademicYearStart(right) - getAcademicYearStart(left));

  return activeCycles[0] || "";
}

async function buildPromotedWaitlistLookup(repositories, items = []) {
  const importKeys = new Set((items || []).map((item) => buildBeneficiaryWaitlistLookupKey(item)).filter(Boolean));
  if (!importKeys.size) {
    return new Map();
  }

  const promotedEntries = await repositories.waitlist.list({ status: "promoted" });
  const lookup = new Map();

  for (const entry of promotedEntries || []) {
    const key = buildBeneficiaryWaitlistLookupKey(entry);
    if (!key || !importKeys.has(key) || lookup.has(key)) continue;
    lookup.set(key, entry);
  }

  return lookup;
}

export function createBeneficiaryService({ repositories }) {
  return {
    async list(filters = {}) {
      const [items, filterOptions] = await Promise.all([
        repositories.beneficiaries.list({
          academicYearLabel: String(filters.academicYearLabel || "").trim(),
          schemeName: String(filters.schemeName || "").trim(),
          college: String(filters.college || "").trim(),
          supportType: String(filters.supportType || "").trim(),
          importMode: String(filters.importMode || "").trim(),
          q: String(filters.q || "").trim()
        }),
        repositories.beneficiaries.listFilterOptions()
      ]);

      return {
        total: items.length,
        items,
        filterOptions
      };
    },

    async getDashboard() {
      const currentYearLabel = await resolveCurrentBeneficiaryYearLabel(repositories);
      return repositories.beneficiaries.getDashboardData({ currentYearLabel });
    },

    async previewImport(payload) {
      const importMode = normalizeImportMode(payload.importMode);
      const duplicateStrategy = normalizeDuplicateStrategy(
        payload.duplicateStrategy,
        Boolean(payload.allowDuplicates)
      );
      const duplicateRowActions = Object.fromEntries(
        Object.entries(payload.duplicateRowActions || {}).map(([key, value]) => [
          Number(key),
          normalizeDuplicateStrategy(value, false)
        ])
      );
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!rows.length) {
        throw new ValidationError("Upload a beneficiary file before generating a preview.");
      }
      const previewSeed = buildBeneficiaryImportPreview(rows, {
        importMode,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        defaultBeneficiaryCohort: payload.beneficiaryCohort || "",
        defaultCurrency: normalizeCurrency(payload.defaultCurrency),
        duplicateStrategy,
        duplicateRowActions
      });
      const existingDuplicateKeys = await repositories.beneficiaries.findExistingDuplicateKeys(
        previewSeed.rows.map((row) => row.payload)
      );
      const crossScopeDuplicateStudentIds = new Set([
        ...(
          await repositories.beneficiaries.findCrossScopeDuplicateStudentIds(
            previewSeed.rows.map((row) => row.payload)
          )
        ),
        ...buildCrossScopeStudentIdSet(previewSeed.rows)
      ]);
      const uploadDuplicateKeys = buildDuplicateKeySet(previewSeed.rows);
      const priorYearNewBeneficiaryKeys =
        importMode === "current_cycle_linked"
          ? await repositories.beneficiaries.findPriorYearNewBeneficiaryKeys(
              previewSeed.rows.map((row) => row.payload)
            )
          : new Set();

      return buildBeneficiaryImportPreview(rows, {
        importMode,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        defaultBeneficiaryCohort: payload.beneficiaryCohort || "",
        defaultCurrency: normalizeCurrency(payload.defaultCurrency),
        duplicateStrategy,
        duplicateRowActions,
        existingDuplicateKeys,
        crossScopeDuplicateStudentIds,
        uploadDuplicateKeys,
        priorYearNewBeneficiaryKeys
      });
    },

    async importRows(payload, actor) {
      const importMode = normalizeImportMode(payload.importMode);
      const duplicateStrategy = normalizeDuplicateStrategy(
        payload.duplicateStrategy,
        Boolean(payload.allowDuplicates)
      );
      const duplicateRowActions = Object.fromEntries(
        Object.entries(payload.duplicateRowActions || {}).map(([key, value]) => [
          Number(key),
          normalizeDuplicateStrategy(value, false)
        ])
      );
      const preview = await this.previewImport({
        ...payload,
        importMode,
        duplicateStrategy,
        duplicateRowActions
      });
      const validRows = preview.rows.filter((row) => row.status === "valid");
      const rejectedRows = preview.rows.filter((row) => row.status !== "valid");

      if (!validRows.length) {
        throw new ValidationError("There are no valid beneficiary rows ready to import.");
      }

      const promotedWaitlistLookup =
        importMode === "current_cycle_linked"
          ? await buildPromotedWaitlistLookup(
              repositories,
              validRows.map((row) => row.payload)
            )
          : new Map();
      const importItems = validRows.map((row) => {
        const item = row.payload;
        const promotedWaitlistEntry = promotedWaitlistLookup.get(
          buildBeneficiaryWaitlistLookupKey(item)
        );

        return {
          ...item,
          duplicateStrategy: row.duplicateStrategy || duplicateStrategy,
          linkedApplicationId: promotedWaitlistEntry?.applicationId || null,
          linkedWaitlistEntryId: promotedWaitlistEntry?.id || null
        };
      });

      const result = await repositories.beneficiaries.importRows({
        items: importItems,
        importMode,
        sourceFileName: payload.fileName || null,
        categorizedByCollege: Boolean(payload.categorizedByCollege),
        beneficiaryCohort: payload.beneficiaryCohort || "",
        allowDuplicates: duplicateStrategy === "import_anyway",
        duplicateStrategy,
        duplicateRowActions,
        actor
      });

      return {
        batchReference: result.batchReference,
        duplicateStrategy,
        summary: {
          totalRows: preview.summary.totalRows,
          importedRows: result.items.length,
          rejectedRows: rejectedRows.length,
          duplicateRows: preview.summary.duplicateRows || 0,
          crossScopeDuplicateRows: preview.summary.crossScopeDuplicateRows || 0,
          replacedRows: result.replacedRows || 0,
          cohortTotals: summarizeBeneficiaryCohorts(result.items)
        },
        preview,
        items: result.items,
        rejectedRows
      };
    },

    async updateRecord(id, payload = {}, actor) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to update.");
      }
      const reason = String(payload.reason || "").trim();
      if (!reason) {
        throw new ValidationError("Provide a short change reason before saving beneficiary updates.");
      }

      const updates = {};
      if (payload.fullName !== undefined) {
        const fullName = String(payload.fullName || "").trim();
        if (!fullName) {
          throw new ValidationError("Beneficiary full name cannot be blank.");
        }
        updates.fullName = fullName;
      }
      if (payload.amountPaid !== undefined) {
        const amountPaid = Number(payload.amountPaid);
        if (Number.isNaN(amountPaid) || amountPaid < 0) {
          throw new ValidationError("Amount paid must be a valid number.");
        }
        updates.amountPaid = amountPaid;
      }
      if (payload.academicYearLabel !== undefined) {
        const academicYearLabel = normalizeAcademicYearLabel(payload.academicYearLabel);
        if (!academicYearLabel) {
          throw new ValidationError("Academic year cannot be blank.");
        }
        updates.academicYearLabel = academicYearLabel;
      }
      if (payload.schemeName !== undefined) {
        const schemeName = String(payload.schemeName || "").trim();
        if (!schemeName) {
          throw new ValidationError("Support name cannot be blank.");
        }
        updates.schemeName = schemeName;
      }
      if (payload.sponsorName !== undefined) {
        updates.sponsorName = String(payload.sponsorName || "").trim() || null;
      }
      if (payload.studentReferenceId !== undefined) {
        const studentReferenceId = String(payload.studentReferenceId || "").trim();
        if (!studentReferenceId) {
          throw new ValidationError("Student reference ID cannot be blank.");
        }
        updates.studentReferenceId = studentReferenceId;
      }
      if (payload.indexNumber !== undefined) {
        updates.indexNumber = String(payload.indexNumber || "").trim() || null;
      }
      if (payload.currency !== undefined) {
        updates.currency = String(payload.currency || "").trim().toUpperCase() || "GHS";
      }
      if (payload.supportType !== undefined) {
        updates.supportType = normalizeSupportType(payload.supportType);
      }
      if (payload.college !== undefined) {
        updates.college = String(payload.college || "").trim() || null;
      }
      if (payload.remarks !== undefined) {
        updates.remarks = String(payload.remarks || "").trim() || null;
      }
      if (payload.beneficiaryCohort !== undefined) {
        updates.beneficiaryCohort = normalizeBeneficiaryCohort(payload.beneficiaryCohort);
      }

      if (!Object.keys(updates).length) {
        throw new ValidationError("Provide at least one beneficiary field to update.");
      }

      return repositories.beneficiaries.updateRecord({
        id: recordId,
        updates,
        replaceExisting: Boolean(payload.replaceExisting),
        reason,
        actor
      });
    },

    async deleteRecord(id, payload = {}, actor) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to remove.");
      }
      const reason = String(payload.reason || "").trim();
      if (!reason) {
        throw new ValidationError("Provide a short reason before removing a beneficiary record.");
      }

      return repositories.beneficiaries.deleteRecord({ id: recordId, reason, actor });
    },

    async getImportHistory(filters = {}) {
      return repositories.beneficiaries.getImportHistory({
        academicYearLabel: String(filters.academicYearLabel || "").trim(),
        schemeName: String(filters.schemeName || "").trim()
      });
    },

    async getRecordHistory(id) {
      const recordId = String(id || "").trim();
      if (!recordId) {
        throw new ValidationError("Choose the beneficiary record you want to review.");
      }

      return repositories.beneficiaries.getRecordHistory({ id: recordId });
    },

    async getAuditFeed(filters = {}) {
      return repositories.beneficiaries.getAuditFeed({
        academicYearLabel: String(filters.academicYearLabel || "").trim(),
        schemeName: String(filters.schemeName || "").trim(),
        eventType: String(filters.eventType || "").trim()
      });
    },

    async rollbackBatch(payload = {}, actor) {
      const batchReference = String(payload.batchReference || "").trim();
      if (!batchReference) {
        throw new ValidationError("Choose the import batch you want to roll back.");
      }
      const reason = String(payload.reason || "").trim();

      return repositories.beneficiaries.rollbackBatch({
        batchReference,
        actor,
        reason
      });
    },

    async clearBySchemeAndYear(payload = {}, actor) {
      const academicYearLabel = String(payload.academicYearLabel || "").trim();
      const schemeName = String(payload.schemeName || "").trim();
      const reason = String(payload.reason || "").trim() || "Scoped beneficiary clear";

      if (!academicYearLabel) {
        throw new ValidationError("Choose the academic year you want to clear.");
      }
      if (!schemeName) {
        throw new ValidationError("Choose the support name you want to clear.");
      }

      const result = await repositories.beneficiaries.clearBySchemeAndYear({
        academicYearLabel,
        schemeName,
        reason,
        actor
      });

      return {
        summary: result,
        message:
          result.deletedRows > 0
            ? `Removed ${result.deletedRows} beneficiary record(s) for ${schemeName} in ${academicYearLabel}.`
            : `No beneficiary records matched ${schemeName} in ${academicYearLabel}.`
      };
    }
  };
}
