import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { createId } from "../../lib/ids.js";

function assertRequiredString(value, label) {
  if (!String(value || "").trim()) {
    throw new ValidationError(`${label} is required.`);
  }
}

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /academic year/i.test(text) ? text.replace(/\s+/g, " ").trim() : `${text} Academic Year`;
}

function toAcademicYearValue(value) {
  return normalizeAcademicYearLabel(value).replace(/\s+Academic Year$/i, "").trim();
}

function toCycleCode(value) {
  return toAcademicYearValue(value).replace(/\//g, "-");
}

function buildSchemeCode(name, academicYearLabel) {
  const normalizedName = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
  const initials = normalizedName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0])
    .join("");
  const yearToken = String(academicYearLabel || "")
    .match(/\d{4}/)?.[0] || String(new Date().getUTCFullYear());
  return `${initials || "SCH"}-${yearToken}`;
}

export function createSchemeService({ repositories }) {
  async function resolveCycle(payload) {
    const cycleId = String(payload.cycleId || "").trim();
    if (cycleId) {
      const cycle = await repositories.cycles.getById(cycleId);
      if (!cycle) {
        throw new NotFoundError("The selected academic year does not exist.");
      }
      return {
        cycle,
        cycleId
      };
    }

    const manualAcademicYear = normalizeAcademicYearLabel(
      payload.academicYearLabel || payload.manualAcademicYearLabel
    );
    if (!manualAcademicYear) {
      throw new ValidationError("Academic year is required.");
    }

    const existingCycle = (await repositories.cycles.list()).find(
      (item) =>
        normalizeAcademicYearLabel(item.label || item.academicYearLabel) === manualAcademicYear
    );

    if (existingCycle) {
      return {
        cycle: existingCycle,
        cycleId: String(existingCycle.id)
      };
    }

    if (typeof repositories.cycles.create !== "function") {
      throw new ValidationError("Manual academic year entry is not available right now.");
    }

    const createdCycle = await repositories.cycles.create({
      code: toCycleCode(manualAcademicYear),
      label: manualAcademicYear,
      academicYearLabel: toAcademicYearValue(manualAcademicYear),
      status: "active"
    });

    return {
      cycle: createdCycle,
      cycleId: String(createdCycle.id)
    };
  }

  async function validateInput(payload, currentSchemeId = null) {
    assertRequiredString(payload.name, "Scheme name");
    assertRequiredString(payload.category, "Scheme category");
    const { cycle, cycleId } = await resolveCycle(payload);

    const duplicateName = (await repositories.schemes.list()).find(
      (item) =>
        item.id !== currentSchemeId &&
        item.name.trim().toLowerCase() === String(payload.name).trim().toLowerCase() &&
        item.cycleId === cycleId
    );
    if (duplicateName) {
      throw new ConflictError(
        "A scheme with this name already exists for the selected academic year."
      );
    }

    return {
      cycle,
      cycleId,
      name: String(payload.name).trim(),
      category: String(payload.category).trim().toLowerCase()
    };
  }

  return {
    async list() {
      return repositories.schemes.list();
    },
    async create(payload) {
      const normalized = await validateInput(payload);

      const baseCode = buildSchemeCode(normalized.name, normalized.cycle.academicYearLabel || normalized.cycle.label);
      let code = baseCode;
      let suffix = 2;
      let existing = await repositories.schemes.findByCode(code);

      while (existing) {
        code = `${baseCode}-${suffix}`;
        suffix += 1;
        existing = await repositories.schemes.findByCode(code);
      }

      return repositories.schemes.create({
        id: createId("scheme"),
        code,
        name: normalized.name,
        category: normalized.category,
        cycleId: normalized.cycleId
      });
    },
    async update(id, payload) {
      const existing = await repositories.schemes.getById(id);
      if (!existing) {
        throw new NotFoundError("Scheme was not found.");
      }

      const normalized = await validateInput(payload, id);
      const updated = await repositories.schemes.update(id, {
        name: normalized.name,
        category: normalized.category,
        cycleId: normalized.cycleId
      });

      if (!updated) {
        throw new NotFoundError("Scheme was not found.");
      }

      return updated;
    },
    async remove(id) {
      const item = await repositories.schemes.getById(id);
      if (!item) {
        throw new NotFoundError("Scheme was not found.");
      }

      const removed = await repositories.schemes.remove(id);
      if (!removed) {
        throw new NotFoundError("Scheme was not found.");
      }

      return {
        id,
        name: item.name
      };
    }
  };
}
