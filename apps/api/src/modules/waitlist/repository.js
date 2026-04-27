import { createId } from "../../lib/ids.js";

function normalizeAcademicYearLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}\/\d{4}$/.test(text) ? `${text} Academic Year` : text;
}

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "waitlisted") return "awaiting_support";
  if (text === "promoted") return "supported";
  if (text === "supported") return "supported";
  return "awaiting_support";
}

function normalizeActorLabel(actor) {
  return (
    String(actor?.fullName || "").trim() ||
    String(actor?.email || "").trim() ||
    String(actor?.userId || "").trim() ||
    "System"
  );
}

function mapStoredRecord(record) {
  return {
    id: String(record.id),
    studentId: record.studentId || null,
    studentName: record.fullName || null,
    fullName: record.fullName || null,
    studentReferenceId: record.studentReferenceId || null,
    indexNumber: record.indexNumber || null,
    email: record.email || null,
    college: record.college || null,
    program: record.program || null,
    year: record.year || null,
    schemeId: record.schemeId || null,
    schemeName: record.schemeName || null,
    cycleId: record.cycleId || null,
    cycleLabel: normalizeAcademicYearLabel(record.cycleLabel),
    recommendationReason: record.recommendationReason || null,
    notes: record.notes || null,
    status: normalizeStatus(record.status),
    sourceType: record.sourceType || "manual_add",
    sourceFileName: record.sourceFileName || null,
    importBatchReference: record.importBatchReference || null,
    linkedApplicationId: record.linkedApplicationId || null,
    linkedBeneficiaryId: record.linkedBeneficiaryId || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function buildFilterOptions(records = []) {
  const statuses = [...new Set(records.map((item) => normalizeStatus(item.status)).filter(Boolean))].sort();
  const academicYears = [...new Set(records.map((item) => normalizeAcademicYearLabel(item.cycleLabel)).filter(Boolean))].sort(
    (left, right) => {
      const leftYear = Number(String(left).match(/\d{4}/)?.[0] || 0);
      const rightYear = Number(String(right).match(/\d{4}/)?.[0] || 0);
      return rightYear - leftYear;
    }
  );
  const schemeNames = [...new Set(records.map((item) => String(item.schemeName || "").trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
  return { statuses, academicYears, schemeNames };
}

function createSampleRepository() {
  const records = [];
  const importBatches = [];

  return {
    async list(filters = {}) {
      const query = String(filters.q || "").trim().toLowerCase();
      const status = normalizeStatus(filters.status);

      return records
        .filter((item) => {
          if (filters.schemeId && String(item.schemeId) !== String(filters.schemeId)) return false;
          if (filters.cycleId && String(item.cycleId) !== String(filters.cycleId)) return false;
          if (filters.status && normalizeStatus(item.status) !== status) return false;
          if (query) {
            const haystack = [
              item.fullName,
              item.studentReferenceId,
              item.indexNumber,
              item.schemeName,
              item.cycleLabel,
              item.recommendationReason,
              item.notes
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        })
        .map(mapStoredRecord)
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    },
    async listFilterOptions() {
      return buildFilterOptions(records);
    },
    async getById(id) {
      const item = records.find((entry) => String(entry.id) === String(id));
      return item ? mapStoredRecord(item) : null;
    },
    async findExisting(studentId, schemeId, cycleId) {
      const item = records.find(
        (entry) =>
          String(entry.studentId) === String(studentId) &&
          String(entry.schemeId) === String(schemeId) &&
          String(entry.cycleId) === String(cycleId)
      );
      return item ? mapStoredRecord(item) : null;
    },
    async create(input, actor) {
      const now = new Date().toISOString();
      const stored = {
        id: createId("recommended"),
        ...input,
        status: normalizeStatus(input.status),
        createdBy: actor?.userId || null,
        createdByName: normalizeActorLabel(actor),
        createdAt: now,
        updatedAt: now
      };
      records.unshift(stored);
      return mapStoredRecord(stored);
    },
    async update(id, input) {
      const target = records.find((entry) => String(entry.id) === String(id));
      if (!target) return null;

      Object.assign(target, {
        studentId: input.studentId,
        studentReferenceId: input.studentReferenceId || null,
        indexNumber: input.indexNumber || null,
        fullName: input.fullName || null,
        email: input.email || null,
        college: input.college || null,
        program: input.program || null,
        year: input.year || null,
        schemeId: input.schemeId,
        schemeName: input.schemeName || null,
        cycleId: input.cycleId,
        cycleLabel: input.cycleLabel || null,
        recommendationReason: input.recommendationReason || null,
        notes: input.notes || null,
        updatedAt: new Date().toISOString()
      });

      return mapStoredRecord(target);
    },
    async importRows({ items, sourceFileName }, actor) {
      const batchReference = createId("recommended-batch");
      const now = new Date().toISOString();
      const importedItems = [];

      for (const item of items || []) {
        const stored = {
          id: createId("recommended"),
          ...item,
          status: normalizeStatus(item.status),
          sourceFileName: sourceFileName || null,
          importBatchReference: batchReference,
          createdBy: actor?.userId || null,
          createdByName: normalizeActorLabel(actor),
          createdAt: now,
          updatedAt: now
        };
        records.unshift(stored);
        importedItems.push(mapStoredRecord(stored));
      }

      importBatches.unshift({
        batchReference,
        sourceFileName: sourceFileName || "recommended-students-import.xlsx",
        rowCount: importedItems.length,
        createdAt: now,
        createdByName: normalizeActorLabel(actor)
      });

      return {
        batchReference,
        items: importedItems
      };
    },
    async linkApplication({ id, applicationId }) {
      const target = records.find((entry) => String(entry.id) === String(id));
      if (!target) return null;
      target.linkedApplicationId = applicationId;
      target.updatedAt = new Date().toISOString();
      return mapStoredRecord(target);
    },
    async markSupported({ id, beneficiaryId }) {
      const target = records.find((entry) => String(entry.id) === String(id));
      if (!target) return null;
      target.linkedBeneficiaryId = beneficiaryId || null;
      target.status = "supported";
      target.updatedAt = new Date().toISOString();
      return mapStoredRecord(target);
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

function mapPostgresRow(row) {
  return {
    id: String(row.id),
    studentId: row.student_id,
    studentName: row.full_name,
    fullName: row.full_name,
    studentReferenceId: row.student_reference_id,
    indexNumber: row.index_number,
    email: row.email,
    college: row.college,
    program: row.program,
    year: row.year_of_study,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    cycleId: row.cycle_id,
    cycleLabel: normalizeAcademicYearLabel(row.cycle_label),
    recommendationReason: row.recommendation_reason,
    notes: row.notes,
    status: normalizeStatus(row.status),
    sourceType: row.source_type,
    sourceFileName: row.source_file_name,
    importBatchReference: row.import_batch_reference,
    linkedApplicationId: row.linked_application_id,
    linkedBeneficiaryId: row.linked_beneficiary_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createPostgresRepository(database) {
  let ensured = false;
  let academicProfileSchemaPromise;

  async function ensureTables() {
    if (ensured) return;
    await database.query(`
      CREATE TABLE IF NOT EXISTS recommended_students (
        id BIGSERIAL PRIMARY KEY,
        student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
        cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
        recommendation_reason TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'awaiting_support',
        source_type TEXT NOT NULL DEFAULT 'manual_add',
        source_file_name TEXT,
        import_batch_reference TEXT,
        linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
        linked_beneficiary_id BIGINT REFERENCES beneficiaries(id) ON DELETE SET NULL,
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recommended_student_import_batches (
        id BIGSERIAL PRIMARY KEY,
        batch_reference TEXT NOT NULL UNIQUE,
        source_file_name TEXT,
        row_count INTEGER NOT NULL DEFAULT 0,
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_recommended_students_scope
        ON recommended_students(student_id, scheme_id, cycle_id);
      CREATE INDEX IF NOT EXISTS idx_recommended_students_status
        ON recommended_students(status, created_at DESC);
    `);
    ensured = true;
  }

  async function getAcademicProfileSchema() {
    if (!academicProfileSchemaPromise) {
      academicProfileSchemaPromise = database
        .query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'academic_profiles'
          `
        )
        .then((result) => new Set(result.rows.map((row) => row.column_name)));
    }

    return academicProfileSchemaPromise;
  }

  async function getAcademicProfileMapping() {
    const columns = await getAcademicProfileSchema();

    return {
      yearColumn: columns.has("year_of_study")
        ? "year_of_study"
        : columns.has("level_label")
          ? "level_label"
          : null
    };
  }

  async function list(filters = {}) {
    await ensureTables();
    const profileMapping = await getAcademicProfileMapping();
    const conditions = [];
    const params = [];

    if (filters.schemeId) {
      params.push(filters.schemeId);
      conditions.push(`rs.scheme_id::text = $${params.length}`);
    }
    if (filters.cycleId) {
      params.push(filters.cycleId);
      conditions.push(`rs.cycle_id::text = $${params.length}`);
    }
    if (filters.status) {
      params.push(normalizeStatus(filters.status));
      conditions.push(`LOWER(TRIM(rs.status)) = LOWER(TRIM($${params.length}))`);
    }
    if (filters.q) {
      params.push(`%${String(filters.q).trim().toLowerCase()}%`);
      conditions.push(`
        (
          LOWER(student.full_name) LIKE $${params.length}
          OR LOWER(COALESCE(reference_identifier.identifier_value, '')) LIKE $${params.length}
          OR LOWER(COALESCE(index_identifier.identifier_value, '')) LIKE $${params.length}
          OR LOWER(scheme.name) LIKE $${params.length}
          OR LOWER(cycle.label) LIKE $${params.length}
          OR LOWER(COALESCE(rs.recommendation_reason, '')) LIKE $${params.length}
          OR LOWER(COALESCE(rs.notes, '')) LIKE $${params.length}
        )
      `);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database.query(
      `
        SELECT
          rs.id::text AS id,
          student.id::text AS student_id,
          student.full_name,
          reference_identifier.identifier_value AS student_reference_id,
          index_identifier.identifier_value AS index_number,
          student.email,
          profile.college,
          profile.program_name AS program,
          ${
            profileMapping.yearColumn
              ? `profile.${profileMapping.yearColumn} AS year_of_study,`
              : "NULL::text AS year_of_study,"
          }
          rs.scheme_id::text AS scheme_id,
          scheme.name AS scheme_name,
          rs.cycle_id::text AS cycle_id,
          cycle.label AS cycle_label,
          rs.recommendation_reason,
          rs.notes,
          rs.status,
          rs.source_type,
          rs.source_file_name,
          rs.import_batch_reference,
          rs.linked_application_id::text AS linked_application_id,
          rs.linked_beneficiary_id::text AS linked_beneficiary_id,
          rs.created_at,
          rs.updated_at
        FROM recommended_students rs
        INNER JOIN students student ON student.id = rs.student_id
        LEFT JOIN student_identifiers reference_identifier
          ON reference_identifier.student_id = student.id
         AND reference_identifier.identifier_type = 'student_reference_id'
         AND reference_identifier.is_primary = TRUE
        LEFT JOIN student_identifiers index_identifier
          ON index_identifier.student_id = student.id
         AND index_identifier.identifier_type = 'index_number'
        LEFT JOIN academic_profiles profile
          ON profile.student_id = student.id
         AND profile.cycle_id = rs.cycle_id
        INNER JOIN schemes scheme ON scheme.id = rs.scheme_id
        INNER JOIN application_cycles cycle ON cycle.id = rs.cycle_id
        ${whereClause}
        ORDER BY rs.created_at DESC, rs.id DESC
      `,
      params
    );

    return result.rows.map(mapPostgresRow);
  }

  return {
    list,
    async listFilterOptions() {
      const items = await list({});
      return buildFilterOptions(items);
    },
    async getById(id) {
      const items = await list({});
      return items.find((item) => String(item.id) === String(id)) || null;
    },
    async findExisting(studentId, schemeId, cycleId) {
      await ensureTables();
      const result = await database.query(
        `
          SELECT id::text AS id
          FROM recommended_students
          WHERE student_id::text = $1
            AND scheme_id::text = $2
            AND cycle_id::text = $3
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        [String(studentId), String(schemeId), String(cycleId)]
      );

      if (!result.rows.length) return null;
      return this.getById(result.rows[0].id);
    },
    async create(input, actor) {
      await ensureTables();
      const result = await database.query(
        `
          INSERT INTO recommended_students (
            student_id,
            scheme_id,
            cycle_id,
            recommendation_reason,
            notes,
            status,
            source_type,
            source_file_name,
            import_batch_reference,
            created_by
          )
          VALUES (
            NULLIF($1, '')::BIGINT,
            NULLIF($2, '')::BIGINT,
            NULLIF($3, '')::BIGINT,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
          )
          RETURNING id::text AS id
        `,
        [
          input.studentId,
          input.schemeId,
          input.cycleId,
          input.recommendationReason || null,
          input.notes || null,
          normalizeStatus(input.status),
          input.sourceType || "manual_add",
          input.sourceFileName || null,
          input.importBatchReference || null,
          toDatabaseUserId(actor)
        ]
      );
      return this.getById(result.rows[0].id);
    },
    async update(id, input) {
      await ensureTables();
      await database.query(
        `
          UPDATE recommended_students
          SET
            student_id = NULLIF($2, '')::BIGINT,
            scheme_id = NULLIF($3, '')::BIGINT,
            cycle_id = NULLIF($4, '')::BIGINT,
            recommendation_reason = $5,
            notes = $6,
            updated_at = NOW()
          WHERE id::text = $1
        `,
        [
          String(id),
          input.studentId,
          input.schemeId,
          input.cycleId,
          input.recommendationReason || null,
          input.notes || null
        ]
      );
      return this.getById(id);
    },
    async importRows({ items, sourceFileName }, actor) {
      await ensureTables();
      const batchReference = createId("recommended-batch");
      const actorUserId = toDatabaseUserId(actor);
      const createdIds = [];

      await database.withTransaction(async (transaction) => {
        for (const item of items || []) {
          const result = await transaction.query(
            `
              INSERT INTO recommended_students (
                student_id,
                scheme_id,
                cycle_id,
                recommendation_reason,
                notes,
                status,
                source_type,
                source_file_name,
                import_batch_reference,
                created_by
              )
              VALUES (
                NULLIF($1, '')::BIGINT,
                NULLIF($2, '')::BIGINT,
                NULLIF($3, '')::BIGINT,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10
              )
              RETURNING id::text AS id
            `,
            [
              item.studentId,
              item.schemeId,
              item.cycleId,
              item.recommendationReason || null,
              item.notes || null,
              normalizeStatus(item.status),
              item.sourceType || "import",
              sourceFileName || null,
              batchReference,
              actorUserId
            ]
          );
          createdIds.push(result.rows[0].id);
        }

        await transaction.query(
          `
            INSERT INTO recommended_student_import_batches (
              batch_reference,
              source_file_name,
              row_count,
              created_by
            )
            VALUES ($1, $2, $3, $4)
          `,
          [batchReference, sourceFileName || null, createdIds.length, actorUserId]
        );
      });

      const allItems = await list({});
      return {
        batchReference,
        items: allItems.filter((item) => createdIds.includes(String(item.id)))
      };
    },
    async linkApplication({ id, applicationId }) {
      await ensureTables();
      await database.query(
        `
          UPDATE recommended_students
          SET linked_application_id = NULLIF($2, '')::BIGINT,
              updated_at = NOW()
          WHERE id::text = $1
        `,
        [String(id), String(applicationId)]
      );
      return this.getById(id);
    },
    async markSupported({ id, beneficiaryId }) {
      await ensureTables();
      await database.query(
        `
          UPDATE recommended_students
          SET linked_beneficiary_id = NULLIF($2, '')::BIGINT,
              status = 'supported',
              updated_at = NOW()
          WHERE id::text = $1
        `,
        [String(id), String(beneficiaryId || "")]
      );
      return this.getById(id);
    },
    async remove(id) {
      await ensureTables();
      const result = await database.query(
        `
          DELETE FROM recommended_students
          WHERE id::text = $1
        `,
        [String(id)]
      );
      return Number(result.rowCount || 0) > 0;
    }
  };
}

export function createWaitlistRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
