import { applicationCriteria, applications, awards, payments, recommendations, schemes, waitlistEntries } from "../../data/sampleData.js";
import { cycles } from "../../data/sampleData.js";

function mapSchemeForResponse(scheme) {
  const cycle = cycles.find((item) => item.id === scheme.cycleId);
  return {
    id: scheme.id,
    code: scheme.code,
    name: scheme.name,
    category: scheme.category,
    funder: scheme.funder,
    funderId: scheme.funderId,
    cycleId: scheme.cycleId || null,
    academicYearLabel: cycle?.academicYearLabel || scheme.academicYearLabel || null,
    availableSlots: scheme.availableSlots ?? null,
    filledSlots: scheme.filledSlots ?? null,
    status: scheme.status || "active"
  };
}

function createSampleRepository() {
  return {
    async list() {
      return schemes.map(mapSchemeForResponse);
    },
    async getById(id) {
      const scheme = schemes.find((item) => item.id === id);
      return scheme ? mapSchemeForResponse(scheme) : null;
    },
    async findByCode(code) {
      const scheme = schemes.find((item) => item.code === code);
      return scheme ? mapSchemeForResponse(scheme) : null;
    },
    async create(input) {
      schemes.unshift(input);
      return mapSchemeForResponse(input);
    },
    async update(id, input) {
      const target = schemes.find((item) => item.id === id);
      if (!target) {
        return null;
      }

      target.name = input.name;
      target.category = input.category;
      target.cycleId = input.cycleId;
      target.cycle = cycles.find((item) => item.id === input.cycleId)?.academicYearLabel || target.cycle;
      return mapSchemeForResponse(target);
    },
    async remove(id) {
      const targetApplicationIds = applications
        .filter((item) => item.schemeId === id)
        .map((item) => item.id);
      const targetRecommendationIds = recommendations
        .filter((item) => targetApplicationIds.includes(item.applicationId))
        .map((item) => item.id);
      const targetAwardIds = awards
        .filter((item) => item.schemeId === id || targetApplicationIds.includes(item.applicationId))
        .map((item) => item.id);

      payments.splice(
        0,
        payments.length,
        ...payments.filter((item) => !targetAwardIds.includes(item.awardId))
      );
      awards.splice(
        0,
        awards.length,
        ...awards.filter((item) => !targetAwardIds.includes(item.id))
      );
      waitlistEntries.splice(
        0,
        waitlistEntries.length,
        ...waitlistEntries.filter(
          (item) => item.schemeId !== id && !targetRecommendationIds.includes(item.recommendationId)
        )
      );
      recommendations.splice(
        0,
        recommendations.length,
        ...recommendations.filter((item) => !targetApplicationIds.includes(item.applicationId))
      );
      applications.splice(
        0,
        applications.length,
        ...applications.filter((item) => item.schemeId !== id)
      );
      applicationCriteria.splice(
        0,
        applicationCriteria.length,
        ...applicationCriteria.filter((item) => item.schemeId !== id)
      );

      const index = schemes.findIndex((item) => item.id === id);
      if (index === -1) {
        return false;
      }

      schemes.splice(index, 1);
      return true;
    }
  };
}

function createPostgresRepository(database) {
  let ensured = false;

  async function ensureSchemeYearTable() {
    if (ensured) return;
    await database.query(`
      CREATE TABLE IF NOT EXISTS scheme_academic_years (
        scheme_id BIGINT PRIMARY KEY REFERENCES schemes(id) ON DELETE CASCADE,
        cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    ensured = true;
  }

  return {
    async list() {
      await ensureSchemeYearTable();
      const result = await database.query(`
        SELECT
          s.id::text AS id,
          s.code,
          s.name,
          s.category,
          s.status,
          f.id::text AS funder_id,
          f.name AS funder_name,
          COALESCE(assignment.cycle_id, linked_cycle.cycle_id)::text AS cycle_id,
          cycle.academic_year_label
        FROM schemes s
        LEFT JOIN funders f ON f.id = s.funder_id
        LEFT JOIN scheme_academic_years assignment ON assignment.scheme_id = s.id
        LEFT JOIN LATERAL (
          SELECT a.cycle_id
          FROM applications a
          WHERE a.scheme_id = s.id
          ORDER BY a.created_at DESC
          LIMIT 1
        ) linked_cycle ON TRUE
        LEFT JOIN application_cycles cycle ON cycle.id = COALESCE(assignment.cycle_id, linked_cycle.cycle_id)
        ORDER BY s.name ASC
      `);

      return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        funder: row.funder_name,
        funderId: row.funder_id,
        cycleId: row.cycle_id || null,
        academicYearLabel: row.academic_year_label || null,
        availableSlots: null,
        filledSlots: null,
        status: row.status
      }));
    },
    async getById(id) {
      await ensureSchemeYearTable();
      const result = await database.query(
        `
          SELECT
            s.id::text AS id,
            s.code,
            s.name,
          s.category,
          s.status,
          f.id::text AS funder_id,
          f.name AS funder_name,
          COALESCE(assignment.cycle_id, linked_cycle.cycle_id)::text AS cycle_id,
          cycle.academic_year_label
          FROM schemes s
          LEFT JOIN funders f ON f.id = s.funder_id
          LEFT JOIN scheme_academic_years assignment ON assignment.scheme_id = s.id
          LEFT JOIN LATERAL (
            SELECT a.cycle_id
            FROM applications a
            WHERE a.scheme_id = s.id
            ORDER BY a.created_at DESC
            LIMIT 1
          ) linked_cycle ON TRUE
          LEFT JOIN application_cycles cycle ON cycle.id = COALESCE(assignment.cycle_id, linked_cycle.cycle_id)
          WHERE s.id::text = $1
          LIMIT 1
        `,
        [id]
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        funder: row.funder_name,
        funderId: row.funder_id,
        cycleId: row.cycle_id || null,
        academicYearLabel: row.academic_year_label || null,
        availableSlots: null,
        filledSlots: null,
        status: row.status
      };
    },
    async findByCode(code) {
      await ensureSchemeYearTable();
      const result = await database.query(
        `
          SELECT
            s.id::text AS id,
            s.code,
            s.name,
          s.category,
          s.status,
          f.id::text AS funder_id,
          f.name AS funder_name,
          COALESCE(assignment.cycle_id, linked_cycle.cycle_id)::text AS cycle_id,
          cycle.academic_year_label
          FROM schemes s
          LEFT JOIN funders f ON f.id = s.funder_id
          LEFT JOIN scheme_academic_years assignment ON assignment.scheme_id = s.id
          LEFT JOIN LATERAL (
            SELECT a.cycle_id
            FROM applications a
            WHERE a.scheme_id = s.id
            ORDER BY a.created_at DESC
            LIMIT 1
          ) linked_cycle ON TRUE
          LEFT JOIN application_cycles cycle ON cycle.id = COALESCE(assignment.cycle_id, linked_cycle.cycle_id)
          WHERE s.code = $1
          LIMIT 1
        `,
        [code]
      );

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        funder: row.funder_name,
        funderId: row.funder_id,
        cycleId: row.cycle_id || null,
        academicYearLabel: row.academic_year_label || null,
        availableSlots: null,
        filledSlots: null,
        status: row.status
      };
    },
    async create(input) {
      await ensureSchemeYearTable();
      const id = await database.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `
            INSERT INTO schemes (
              code,
              name,
              category,
              default_award_amount,
              status
            )
            VALUES ($1, $2, $3, NULL, 'active')
            RETURNING id::text AS id
          `,
          [input.code, input.name, input.category]
        );

        const id = result.rows[0].id;
        await transaction.query(
          `
            INSERT INTO scheme_academic_years (
              scheme_id,
              cycle_id
            )
            VALUES (NULLIF($1, '')::BIGINT, NULLIF($2, '')::BIGINT)
          `,
          [id, input.cycleId]
        );

        return id;
      });

      return this.getById(id);
    },
    async update(id, input) {
      await ensureSchemeYearTable();
      const updated = await database.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `
            UPDATE schemes
            SET
              name = $2,
              category = $3,
              updated_at = NOW()
            WHERE id::text = $1
            RETURNING id::text AS id
          `,
          [id, input.name, input.category]
        );

        if (!result.rowCount) {
          return null;
        }

        await transaction.query(
          `
            INSERT INTO scheme_academic_years (
              scheme_id,
              cycle_id
            )
            VALUES (NULLIF($1, '')::BIGINT, NULLIF($2, '')::BIGINT)
            ON CONFLICT (scheme_id)
            DO UPDATE SET cycle_id = EXCLUDED.cycle_id
          `,
          [id, input.cycleId]
        );

        return result.rows[0].id;
      });

      return updated ? this.getById(updated) : null;
    },
    async remove(id) {
      await ensureSchemeYearTable();
      const removed = await database.withTransaction(async (transaction) => {
        const applicationIdRows = await transaction.query(
          `SELECT id::text AS id FROM applications WHERE scheme_id::text = $1`,
          [id]
        );
        const applicationIds = applicationIdRows.rows.map((row) => row.id);
        const waitlistIdRows = await transaction.query(
          `SELECT id::text AS id FROM waitlist_entries WHERE scheme_id::text = $1`,
          [id]
        );
        const waitlistIds = waitlistIdRows.rows.map((row) => row.id);
        const awardIdRows = await transaction.query(
          `SELECT id::text AS id FROM awards WHERE scheme_id::text = $1`,
          [id]
        );
        const awardIds = awardIdRows.rows.map((row) => row.id);

        if (waitlistIds.length) {
          await transaction.query(
            `UPDATE awards SET waitlist_entry_id = NULL WHERE waitlist_entry_id::text = ANY($1::text[])`,
            [waitlistIds]
          );
        }
        if (awardIds.length) {
          await transaction.query(
            `UPDATE waitlist_entries SET promoted_award_id = NULL WHERE promoted_award_id::text = ANY($1::text[])`,
            [awardIds]
          );
          await transaction.query(`DELETE FROM payments WHERE award_id::text = ANY($1::text[])`, [awardIds]);
          await transaction.query(`DELETE FROM award_renewals WHERE award_id::text = ANY($1::text[])`, [awardIds]);
        }
        if (awardIds.length) {
          await transaction.query(`DELETE FROM awards WHERE id::text = ANY($1::text[])`, [awardIds]);
        }
        if (waitlistIds.length) {
          await transaction.query(`DELETE FROM waitlist_entries WHERE id::text = ANY($1::text[])`, [waitlistIds]);
        }
        if (applicationIds.length) {
          await transaction.query(
            `DELETE FROM application_scores WHERE application_id::text = ANY($1::text[])`,
            [applicationIds]
          );
          await transaction.query(
            `DELETE FROM eligibility_checks WHERE application_id::text = ANY($1::text[])`,
            [applicationIds]
          );
          await transaction.query(
            `DELETE FROM application_documents WHERE application_id::text = ANY($1::text[])`,
            [applicationIds]
          );
          await transaction.query(
            `DELETE FROM recommendations WHERE application_id::text = ANY($1::text[])`,
            [applicationIds]
          );
          await transaction.query(`DELETE FROM applications WHERE id::text = ANY($1::text[])`, [applicationIds]);
        }
        await transaction.query(`DELETE FROM application_review_rules WHERE scheme_id::text = $1`, [id]).catch(() => {});
        await transaction.query(`DELETE FROM scoring_templates WHERE scheme_id::text = $1`, [id]).catch(() => {});
        await transaction.query(`DELETE FROM scheme_academic_years WHERE scheme_id::text = $1`, [id]);
        const result = await transaction.query(`DELETE FROM schemes WHERE id::text = $1`, [id]);
        return result.rowCount > 0;
      });

      return removed;
    }
  };
}

export function createSchemeRepository({ database }) {
  return database.enabled ? createPostgresRepository(database) : createSampleRepository();
}
