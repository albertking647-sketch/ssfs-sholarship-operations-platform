import { createId } from "../../lib/ids.js";

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "served") return "served";
  return "registered";
}

function normalizeSupportType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["food", "food support", "food_support"].includes(text)) return "food_support";
  if (["clothing", "clothing support", "clothing_support"].includes(text)) {
    return "clothing_support";
  }
  return null;
}

function normalizeSupportTypes(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[;,/|]+/)
        .map((item) => item.trim())
        .filter(Boolean);

  const normalized = [...new Set(values.map(normalizeSupportType).filter(Boolean))];
  return normalized.length ? normalized : ["food_support"];
}

function normalizeSemester(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["first", "first semester", "semester 1", "1", "1st", "first_semester"].includes(text)) {
    return "first_semester";
  }
  if (["second", "second semester", "semester 2", "2", "2nd", "second_semester"].includes(text)) {
    return "second_semester";
  }
  return null;
}

function normalizeActorLabel(actor) {
  return (
    String(actor?.fullName || "").trim() ||
    String(actor?.email || "").trim() ||
    String(actor?.userId || "").trim() ||
    "System"
  );
}

function mapRecord(record) {
  return {
    id: String(record.id),
    studentId: record.studentId || null,
    academicYearLabel: normalizeAcademicYearLabel(record.academicYearLabel),
    semester: normalizeSemester(record.semester),
    referralSource: record.referralSource || null,
    notes: record.notes || null,
    supportTypes: normalizeSupportTypes(record.supportTypes),
    status: normalizeStatus(record.status),
    sourceType: record.sourceType || "manual_add",
    sourceFileName: record.sourceFileName || null,
    importBatchReference: record.importBatchReference || null,
    servedAt: record.servedAt || null,
    servedByName: record.servedByName || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function buildFilterOptions(items = []) {
  return {
    academicYears: [...new Set(items.map((item) => item.academicYearLabel).filter(Boolean))].sort(
      (left, right) => {
        const leftYear = Number(String(left).match(/\d{4}/)?.[0] || 0);
        const rightYear = Number(String(right).match(/\d{4}/)?.[0] || 0);
        return rightYear - leftYear;
      }
    ),
    semesters: [...new Set(items.map((item) => item.semester).filter(Boolean))],
    statuses: [...new Set(items.map((item) => item.status).filter(Boolean))].sort()
  };
}

function createSampleRepository() {
  const records = [];

  return {
    async list(filters = {}) {
      return records
        .filter((item) => {
          if (
            filters.academicYearLabel &&
            normalizeAcademicYearLabel(item.academicYearLabel) !==
              normalizeAcademicYearLabel(filters.academicYearLabel)
          ) {
            return false;
          }
          if (filters.status && normalizeStatus(item.status) !== normalizeStatus(filters.status)) {
            return false;
          }
          return true;
        })
        .map(mapRecord)
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    },
    async listFilterOptions() {
      return buildFilterOptions(records.map(mapRecord));
    },
    async getById(id) {
      const item = records.find((entry) => String(entry.id) === String(id));
      return item ? mapRecord(item) : null;
    },
    async findExisting(studentId, academicYearLabel, semester) {
      const item = records.find(
        (entry) =>
          String(entry.studentId) === String(studentId) &&
          normalizeAcademicYearLabel(entry.academicYearLabel) ===
            normalizeAcademicYearLabel(academicYearLabel) &&
          normalizeSemester(entry.semester) === normalizeSemester(semester)
      );
      return item ? mapRecord(item) : null;
    },
    async create(input, actor) {
      const now = new Date().toISOString();
      const stored = {
        id: createId("food-bank"),
        ...input,
        semester: normalizeSemester(input.semester),
        supportTypes: normalizeSupportTypes(input.supportTypes),
        status: normalizeStatus(input.status),
        createdBy: actor?.userId || null,
        createdByName: normalizeActorLabel(actor),
        createdAt: now,
        updatedAt: now
      };
      records.unshift(stored);
      return mapRecord(stored);
    },
    async update(id, input) {
      const target = records.find((entry) => String(entry.id) === String(id));
      if (!target) return null;
      const now = new Date().toISOString();
      target.studentId = input.studentId;
      target.academicYearLabel = normalizeAcademicYearLabel(input.academicYearLabel);
      target.semester = normalizeSemester(input.semester);
      target.referralSource = input.referralSource || null;
      target.notes = input.notes || null;
      target.supportTypes = normalizeSupportTypes(input.supportTypes);
      target.updatedAt = now;
      return mapRecord(target);
    },
    async importRows({ items, sourceFileName }, actor) {
      const batchReference = createId("food-bank-batch");
      const now = new Date().toISOString();
      const importedItems = [];
      for (const item of items || []) {
        const stored = {
          id: createId("food-bank"),
          ...item,
          supportTypes: normalizeSupportTypes(item.supportTypes),
          status: normalizeStatus(item.status),
          sourceFileName: sourceFileName || null,
          importBatchReference: batchReference,
          createdBy: actor?.userId || null,
          createdByName: normalizeActorLabel(actor),
          createdAt: now,
          updatedAt: now
        };
        records.unshift(stored);
        importedItems.push(mapRecord(stored));
      }
      return {
        batchReference,
        items: importedItems
      };
    },
    async markServed(id, actor) {
      const target = records.find((entry) => String(entry.id) === String(id));
      if (!target) return null;
      target.status = "served";
      target.servedAt = new Date().toISOString();
      target.servedByName = normalizeActorLabel(actor);
      target.updatedAt = target.servedAt;
      return mapRecord(target);
    },
    async remove(id) {
      const index = records.findIndex((entry) => String(entry.id) === String(id));
      if (index === -1) return false;
      records.splice(index, 1);
      return true;
    }
  };
}

function toDatabaseUserId(actor) {
  return /^\d+$/.test(String(actor?.userId || "")) ? Number(actor.userId) : null;
}

function createPostgresRepository(database) {
  let ensured = false;

  async function ensureTables() {
    if (ensured) return;
    await database.query(`
      CREATE TABLE IF NOT EXISTS food_bank_registrations (
        id BIGSERIAL PRIMARY KEY,
        student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year_label TEXT NOT NULL,
        semester TEXT,
        referral_source TEXT,
        notes TEXT,
        support_types TEXT[] NOT NULL DEFAULT ARRAY['food_support']::TEXT[],
        status TEXT NOT NULL DEFAULT 'registered',
        source_type TEXT NOT NULL DEFAULT 'manual_add',
        source_file_name TEXT,
        import_batch_reference TEXT,
        served_at TIMESTAMPTZ,
        served_by_name TEXT,
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(student_id, academic_year_label, semester)
      )
    `);
    await database.query(`
      ALTER TABLE food_bank_registrations
      ADD COLUMN IF NOT EXISTS semester TEXT
    `);
    await database.query(`
      ALTER TABLE food_bank_registrations
      ADD COLUMN IF NOT EXISTS support_types TEXT[] NOT NULL DEFAULT ARRAY['food_support']::TEXT[]
    `);
    await database.query(`
      ALTER TABLE food_bank_registrations
      DROP CONSTRAINT IF EXISTS food_bank_registrations_student_id_academic_year_label_key
    `);
    await database.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'food_bank_registrations_student_year_semester_key'
        ) THEN
          ALTER TABLE food_bank_registrations
          ADD CONSTRAINT food_bank_registrations_student_year_semester_key
          UNIQUE (student_id, academic_year_label, semester);
        END IF;
      END
      $$;
    `);
    ensured = true;
  }

  function mapRow(row) {
    return {
      id: String(row.id),
      studentId: row.student_id,
      academicYearLabel: normalizeAcademicYearLabel(row.academic_year_label),
      semester: normalizeSemester(row.semester),
      referralSource: row.referral_source,
      notes: row.notes,
      supportTypes: normalizeSupportTypes(row.support_types),
      status: normalizeStatus(row.status),
      sourceType: row.source_type,
      sourceFileName: row.source_file_name,
      importBatchReference: row.import_batch_reference,
      servedAt: row.served_at,
      servedByName: row.served_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  return {
    async list(filters = {}) {
      await ensureTables();
      const conditions = [];
      const params = [];
      if (filters.academicYearLabel) {
        params.push(normalizeAcademicYearLabel(filters.academicYearLabel));
        conditions.push(`academic_year_label = $${params.length}`);
      }
      if (filters.status) {
        params.push(normalizeStatus(filters.status));
        conditions.push(`status = $${params.length}`);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(`
        SELECT *
        FROM food_bank_registrations
        ${whereClause}
        ORDER BY created_at DESC
      `, params);
      return result.rows.map(mapRow);
    },
    async listFilterOptions() {
      const items = await this.list({});
      return buildFilterOptions(items);
    },
    async getById(id) {
      await ensureTables();
      const result = await database.query(
        `SELECT * FROM food_bank_registrations WHERE id = $1 LIMIT 1`,
        [id]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
    async findExisting(studentId, academicYearLabel, semester) {
      await ensureTables();
      const result = await database.query(
        `
          SELECT *
          FROM food_bank_registrations
          WHERE student_id = $1
            AND academic_year_label = $2
            AND semester IS NOT DISTINCT FROM $3
          LIMIT 1
        `,
        [studentId, normalizeAcademicYearLabel(academicYearLabel), normalizeSemester(semester)]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
    async create(input, actor) {
      await ensureTables();
      const result = await database.query(
        `
          INSERT INTO food_bank_registrations (
            student_id,
            academic_year_label,
            semester,
            referral_source,
            notes,
            support_types,
            status,
            source_type,
            source_file_name,
            import_batch_reference,
            served_at,
            served_by_name,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `,
        [
          input.studentId,
          normalizeAcademicYearLabel(input.academicYearLabel),
          normalizeSemester(input.semester),
          input.referralSource || null,
          input.notes || null,
          normalizeSupportTypes(input.supportTypes),
          normalizeStatus(input.status),
          input.sourceType || "manual_add",
          input.sourceFileName || null,
          input.importBatchReference || null,
          input.servedAt || null,
          input.servedByName || null,
          toDatabaseUserId(actor)
        ]
      );
      return mapRow(result.rows[0]);
    },
    async update(id, input) {
      await ensureTables();
      const result = await database.query(
        `
          UPDATE food_bank_registrations
          SET
            student_id = $2,
            academic_year_label = $3,
            semester = $4,
            referral_source = $5,
            notes = $6,
            support_types = $7,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          id,
          input.studentId,
          normalizeAcademicYearLabel(input.academicYearLabel),
          normalizeSemester(input.semester),
          input.referralSource || null,
          input.notes || null,
          normalizeSupportTypes(input.supportTypes)
        ]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
    async importRows({ items, sourceFileName }, actor) {
      await ensureTables();
      const batchReference = createId("food-bank-batch");
      const importedItems = [];
      for (const item of items || []) {
        const created = await this.create(
          {
            ...item,
            sourceType: "upload",
            sourceFileName: sourceFileName || null,
            importBatchReference: batchReference
          },
          actor
        );
        importedItems.push(created);
      }
      return {
        batchReference,
        items: importedItems
      };
    },
    async markServed(id, actor) {
      await ensureTables();
      const result = await database.query(
        `
          UPDATE food_bank_registrations
          SET status = 'served',
              served_at = NOW(),
              served_by_name = $2,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id, normalizeActorLabel(actor)]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },
    async remove(id) {
      await ensureTables();
      const result = await database.query(
        `
          DELETE FROM food_bank_registrations
          WHERE id = $1
          RETURNING id
        `,
        [id]
      );
      return Boolean(result.rows[0]);
    }
  };
}

export function createFoodBankRepository({ database }) {
  if (database?.enabled) {
    return createPostgresRepository(database);
  }
  return createSampleRepository();
}
