function createSampleAuditRepository() {
  const events = [];

  return {
    events,
    async record(event) {
      const stored = {
        ...event,
        createdAt: new Date().toISOString()
      };
      events.push(stored);
      return stored;
    }
  };
}

function createPostgresAuditRepository({ database }) {
  return {
    async record(event) {
      const result = await database.query(
        `
          INSERT INTO audit_logs (
            actor_user_id,
            action_code,
            entity_type,
            entity_id,
            summary,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING
            id::text AS id,
            actor_user_id::text AS actor_user_id,
            action_code,
            entity_type,
            entity_id,
            summary,
            metadata,
            created_at
        `,
        [
          event.actorUserId,
          event.actionCode,
          event.entityType,
          event.entityId,
          event.summary,
          JSON.stringify(event.metadata || {})
        ]
      );

      const row = result.rows[0];
      return {
        id: row?.id || null,
        actorUserId: row?.actor_user_id || null,
        actionCode: row?.action_code || event.actionCode,
        entityType: row?.entity_type || event.entityType,
        entityId: row?.entity_id || event.entityId,
        summary: row?.summary || event.summary,
        metadata: row?.metadata || event.metadata || {},
        createdAt: row?.created_at || null
      };
    }
  };
}

export function createAuditRepository({ database }) {
  return database?.enabled
    ? createPostgresAuditRepository({ database })
    : createSampleAuditRepository();
}
