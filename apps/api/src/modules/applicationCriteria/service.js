import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAuditEvent } from "../../lib/audit.js";

function normalizeNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`${label} must be a valid number.`);
  }

  return parsed;
}

function normalizeDocuments(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createApplicationCriteriaService({ repositories }) {
  return {
    async getBySchemeCycle(filters) {
      const schemeId = String(filters.schemeId || "").trim();
      const cycleId = String(filters.cycleId || "").trim();

      if (!schemeId || !cycleId) {
        return null;
      }

      return repositories.applicationCriteria.getBySchemeCycle(schemeId, cycleId);
    },
    async upsert(payload, actor) {
      const schemeId = String(payload.schemeId || "").trim();
      const cycleId = String(payload.cycleId || "").trim();

      if (!schemeId) {
        throw new ValidationError("Scheme is required.");
      }
      if (!cycleId) {
        throw new ValidationError("Cycle is required.");
      }

      const scheme = await repositories.schemes.getById(schemeId);
      if (!scheme) {
        throw new NotFoundError("The selected scheme does not exist.");
      }

      const cycle = await repositories.cycles.getById(cycleId);
      if (!cycle) {
        throw new NotFoundError("The selected cycle does not exist.");
      }

      const item = await repositories.applicationCriteria.upsert(
        {
          schemeId,
          cycleId,
          requiredDocuments: normalizeDocuments(payload.requiredDocuments),
          cwaCutoff: normalizeNumber(payload.cwaCutoff, "CWA cut-off"),
          wassceCutoff: normalizeNumber(payload.wassceCutoff, "WASSCE cut-off"),
          interviewRequired: Boolean(payload.interviewRequired),
          notes: String(payload.notes || "").trim() || null
        },
        actor
      );
      await recordAuditEvent(repositories.audit, {
        actor,
        actionCode: "application_criteria.upserted",
        entityType: "application_criteria",
        entityId: item.id || `${schemeId}:${cycleId}`,
        summary: "Application criteria were saved.",
        metadata: {
          schemeId,
          cycleId
        }
      });
      return item;
    }
  };
}
