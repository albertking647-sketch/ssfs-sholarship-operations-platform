function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString();
}

function renderLifecycleActions(item, canManageLifecycle) {
  if (!canManageLifecycle) {
    return "";
  }

  return `
    <div class="scheme-card-actions">
      <button class="result-select-button" type="button" data-academic-history-edit="${escapeHtml(
        item.id
      )}">Edit</button>
      <button class="action-button tertiary" type="button" data-academic-history-delete="${escapeHtml(
        item.id
      )}">Delete</button>
    </div>
  `;
}

export function renderAcademicHistoryResultsMarkup(items = [], options = {}) {
  const canManageLifecycle = Boolean(options.canManageLifecycle);

  if (!items.length) {
    return `<p class="empty-state">No imported CWA history records match the current search. The student may still exist in the main registry without an imported CWA result yet.</p>`;
  }

  return items
    .map(
      (item) => `
        <article class="search-result-card fade-in history-record-card">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.studentName || "Student record")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.program || "Program not captured")} | ${escapeHtml(
                item.college || "College not captured"
              )}</p>
            </div>
            <div class="scheme-card-actions">
              <button class="result-select-button" type="button" data-history-student-id="${escapeHtml(
                item.studentId || ""
              )}">Open registry record</button>
              ${renderLifecycleActions(item, canManageLifecycle)}
            </div>
          </div>
          <div class="search-meta">
            <span class="meta-pill">Ref ID: ${escapeHtml(item.studentReferenceId || "N/A")}</span>
            <span class="meta-pill">Index: ${escapeHtml(item.indexNumber || "N/A")}</span>
            <span class="meta-pill">${escapeHtml(item.academicYearLabel || "Academic year not captured")}</span>
            <span class="meta-pill">${escapeHtml(item.semesterLabel || "Semester not captured")}</span>
            <span class="meta-pill">CWA: ${escapeHtml(item.cwa ?? "N/A")}</span>
            ${
              item.importBatchReference
                ? `<span class="meta-pill">Imported</span>`
                : `<span class="meta-pill">Manual</span>`
            }
          </div>
        </article>
      `
    )
    .join("");
}

export function renderAcademicHistoryImportHistoryMarkup(history = {}) {
  const items = Array.isArray(history.items) ? history.items : [];
  if (!items.length) {
    return `<p class="empty-state">No academic history import batches match the current academic year and semester yet.</p>`;
  }

  return items
    .map(
      (item) => `
        <article class="search-result-card fade-in">
          <div class="search-result-top">
            <div>
              <strong>${escapeHtml(item.fileName || "Imported workbook")}</strong>
              <p class="detail-subcopy">${escapeHtml(item.academicYearLabel || "Academic year not captured")} | ${escapeHtml(
                item.semesterLabel || "Semester not captured"
              )}</p>
            </div>
            ${
              item.status === "completed"
                ? `<button class="action-button tertiary" type="button" data-academic-history-rollback="${escapeHtml(
                    item.batchReference
                  )}">Roll back batch</button>`
                : `<span class="flag-pill warning">Rolled back</span>`
            }
          </div>
          <div class="search-meta">
            <span class="meta-pill">Imported: ${escapeHtml(item.importedRows ?? 0)}</span>
            <span class="meta-pill">Updated: ${escapeHtml(item.updatedRows ?? 0)}</span>
            <span class="meta-pill">Status: ${escapeHtml(item.status || "completed")}</span>
            ${
              item.createdAt
                ? `<span class="meta-pill">${escapeHtml(formatDateTime(item.createdAt))}</span>`
                : ""
            }
            ${
              item.rollbackReason
                ? `<span class="meta-pill">Reason: ${escapeHtml(item.rollbackReason)}</span>`
                : ""
            }
          </div>
        </article>
      `
    )
    .join("");
}
