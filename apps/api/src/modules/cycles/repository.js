import { cycles } from "../../data/sampleData.js";
import { createId } from "../../lib/ids.js";

const DEFAULT_ACADEMIC_YEARS = [
  {
    code: "2025-2026",
    label: "2025/2026 Academic Year",
    academicYearLabel: "2025/2026"
  },
  {
    code: "2026-2027",
    label: "2026/2027 Academic Year",
    academicYearLabel: "2026/2027"
  },
  {
    code: "2027-2028",
    label: "2027/2028 Academic Year",
    academicYearLabel: "2027/2028"
  },
  {
    code: "2028-2029",
    label: "2028/2029 Academic Year",
    academicYearLabel: "2028/2029"
  }
];

function mapCycle(row) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    academicYearLabel: row.academicYearLabel || row.academic_year_label || null,
    status: row.status || "active"
  };
}

function normalizeAcademicYearInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /academic year/i.test(text) ? text.replace(/\s+/g, " ").trim() : `${text} Academic Year`;
}

function toAcademicYearValue(value) {
  return normalizeAcademicYearInput(value).replace(/\s+Academic Year$/i, "").trim();
}

function toCycleCode(value) {
  return toAcademicYearValue(value).replace(/\//g, "-");
}

function createSampleRepository() {
  return {
    async list() {
      return cycles.map(mapCycle);
    },
    async getById(id) {
      const item = cycles.find((cycle) => cycle.id === id);
      return item ? mapCycle(item) : null;
    },
    async create(input) {
      const created = {
        id: input.id || createId("cycle"),
        code: input.code || toCycleCode(input.academicYearLabel || input.label),
        label: normalizeAcademicYearInput(input.label || input.academicYearLabel),
        academicYearLabel: toAcademicYearValue(input.academicYearLabel || input.label),
        status: input.status || "active"
      };
      cycles.push(created);
      return mapCycle(created);
    }
  };
}

function createPostgresRepository(database) {
  let ensured = false;

  async function ensureDefaultCycles() {
    if (ensured) {
      return;
    }

    for (const item of DEFAULT_ACADEMIC_YEARS) {
      await database.query(
        `
          INSERT INTO application_cycles (
            code,
            label,
            academic_year_label,
            status
          )
          VALUES ($1, $2, $3, 'active')
          ON CONFLICT (code) DO UPDATE
          SET
            label = EXCLUDED.label,
            academic_year_label = EXCLUDED.academic_year_label
        `,
        [item.code, item.label, item.academicYearLabel]
      );
    }

    ensured = true;
  }

  return {
    async list() {
      await ensureDefaultCycles();
      const result = await database.query(`
        SELECT
          id::text AS id,
          code,
          label,
          academic_year_label,
          status
        FROM application_cycles
        ORDER BY academic_year_label ASC
      `);

      return result.rows.map(mapCycle);
    },
    async getById(id) {
      await ensureDefaultCycles();
      const result = await database.query(
        `
          SELECT
            id::text AS id,
            code,
            label,
            academic_year_label,
            status
          FROM application_cycles
          WHERE id::text = $1
          LIMIT 1
        `,
        [id]
      );

      return result.rows[0] ? mapCycle(result.rows[0]) : null;
    },
    async create(input) {
      await ensureDefaultCycles();
      const result = await database.query(
        `
          INSERT INTO application_cycles (
            code,
            label,
            academic_year_label,
            status
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (code) DO UPDATE
          SET
            label = EXCLUDED.label,
            academic_year_label = EXCLUDED.academic_year_label,
            status = EXCLUDED.status,
            updated_at = NOW()
          RETURNING
            id::text AS id,
            code,
            label,
            academic_year_label,
            status
        `,
        [
          input.code || toCycleCode(input.academicYearLabel || input.label),
          normalizeAcademicYearInput(input.label || input.academicYearLabel),
          toAcademicYearValue(input.academicYearLabel || input.label),
          input.status || "active"
        ]
      );

      return mapCycle(result.rows[0]);
    }
  };
}

export function createCycleRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
