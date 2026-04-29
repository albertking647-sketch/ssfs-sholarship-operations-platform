function toActorUserId(actor) {
  const raw = String(actor?.userId || "").trim();
  return /^\d+$/u.test(raw) ? Number(raw) : null;
}

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
}

export async function recordAuditEvent(auditRepository, event = {}) {
  if (!auditRepository?.record) {
    return null;
  }

  const actor = event.actor || null;
  return auditRepository.record({
    actorUserId: toActorUserId(actor),
    actionCode: String(event.actionCode || "").trim(),
    entityType: String(event.entityType || "").trim(),
    entityId: String(event.entityId || "").trim() || "unknown",
    summary: String(event.summary || "").trim() || "Audit event recorded.",
    metadata: normalizeMetadata(event.metadata)
  });
}
