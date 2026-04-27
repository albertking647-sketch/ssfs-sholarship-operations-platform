import { applicationCriteria } from "../../data/sampleData.js";

function mapCriteriaRecord(item) {
  return {
    id: item.id,
    schemeId: item.schemeId,
    cycleId: item.cycleId,
    requiredDocuments: Array.isArray(item.requiredDocuments) ? item.requiredDocuments : [],
    cwaCutoff: item.cwaCutoff ?? null,
    wassceCutoff: item.wassceCutoff ?? null,
    interviewRequired: Boolean(item.interviewRequired),
    notes: item.notes || null
  };
}

function createSampleRepository() {
  return {
    async getBySchemeCycle(schemeId, cycleId) {
      const item = applicationCriteria.find(
        (entry) => entry.schemeId === schemeId && entry.cycleId === cycleId
      );
      return item ? mapCriteriaRecord(item) : null;
    },
    async upsert(input) {
      const index = applicationCriteria.findIndex(
        (entry) => entry.schemeId === input.schemeId && entry.cycleId === input.cycleId
      );

      if (index === -1) {
        const record = mapCriteriaRecord({
          id: input.id,
          ...input
        });
        applicationCriteria.unshift(record);
        return record;
      }

      applicationCriteria[index] = {
        ...applicationCriteria[index],
        ...input
      };
      return mapCriteriaRecord(applicationCriteria[index]);
    }
  };
}

function toDatabaseUserId(actor) {
  return /^\d+$/.test(String(actor?.userId || "")) ? Number(actor.userId) : null;
}

function createPostgresRepository(database) {
  let ensured = false;

  async function ensureTable() {
    if (ensured) return;
    await database.query(`
      CREATE TABLE IF NOT EXISTS application_review_rules (
        id BIGSERIAL PRIMARY KEY,
        scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
        cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
        required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        cwa_cutoff NUMERIC(5, 2),
        wassce_cutoff NUMERIC(5, 2),
        interview_required BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        created_by BIGINT REFERENCES users(id),
        updated_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (scheme_id, cycle_id)
      )
    `);
    ensured = true;
  }

  async function getBySchemeCycle(schemeId, cycleId) {
    await ensureTable();
    const result = await database.query(
      `
        SELECT
          id::text AS id,
          scheme_id::text AS scheme_id,
          cycle_id::text AS cycle_id,
          required_documents,
          cwa_cutoff,
          wassce_cutoff,
          interview_required,
          notes
        FROM application_review_rules
        WHERE scheme_id::text = $1
          AND cycle_id::text = $2
        LIMIT 1
      `,
      [schemeId, cycleId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      schemeId: row.scheme_id,
      cycleId: row.cycle_id,
      requiredDocuments: Array.isArray(row.required_documents) ? row.required_documents : [],
      cwaCutoff: row.cwa_cutoff === null ? null : Number(row.cwa_cutoff),
      wassceCutoff: row.wassce_cutoff === null ? null : Number(row.wassce_cutoff),
      interviewRequired: Boolean(row.interview_required),
      notes: row.notes || null
    };
  }

  async function upsert(input, actor) {
    await ensureTable();
    const userId = toDatabaseUserId(actor);
    const result = await database.query(
      `
        INSERT INTO application_review_rules (
          scheme_id,
          cycle_id,
          required_documents,
          cwa_cutoff,
          wassce_cutoff,
          interview_required,
          notes,
          created_by,
          updated_by
        )
        VALUES (
          NULLIF($1, '')::BIGINT,
          NULLIF($2, '')::BIGINT,
          $3::jsonb,
          $4,
          $5,
          $6,
          $7,
          $8,
          $8
        )
        ON CONFLICT (scheme_id, cycle_id)
        DO UPDATE SET
          required_documents = EXCLUDED.required_documents,
          cwa_cutoff = EXCLUDED.cwa_cutoff,
          wassce_cutoff = EXCLUDED.wassce_cutoff,
          interview_required = EXCLUDED.interview_required,
          notes = EXCLUDED.notes,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id::text AS id
      `,
      [
        input.schemeId,
        input.cycleId,
        JSON.stringify(input.requiredDocuments || []),
        input.cwaCutoff,
        input.wassceCutoff,
        Boolean(input.interviewRequired),
        input.notes || null,
        userId
      ]
    );

    return getBySchemeCycle(input.schemeId, input.cycleId, result.rows[0]?.id);
  }

  return {
    getBySchemeCycle,
    upsert
  };
}

export function createApplicationCriteriaRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
