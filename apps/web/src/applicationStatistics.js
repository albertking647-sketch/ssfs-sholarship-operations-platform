function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function numberValue(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function renderApplicationCollegeBreakdownMarkup(summary = {}) {
  const rows = Array.isArray(summary?.collegeBreakdown) ? summary.collegeBreakdown : [];
  if (!rows.length) {
    return `<p class="empty-state">College breakdown will appear once applications are loaded in the current review scope.</p>`;
  }
  const totals = rows.reduce(
    (accumulator, item) => ({
      totalApplications: accumulator.totalApplications + numberValue(item.totalApplications),
      reviewedCount: accumulator.reviewedCount + numberValue(item.reviewedCount),
      qualifiedCount: accumulator.qualifiedCount + numberValue(item.qualifiedCount),
      pendingCount: accumulator.pendingCount + numberValue(item.pendingCount),
      disqualifiedCount: accumulator.disqualifiedCount + numberValue(item.disqualifiedCount),
      notReviewedCount: accumulator.notReviewedCount + numberValue(item.notReviewedCount),
      interviewCompletedCount:
        accumulator.interviewCompletedCount + numberValue(item.interviewCompletedCount),
      interviewScheduledCount:
        accumulator.interviewScheduledCount + numberValue(item.interviewScheduledCount),
      interviewPendingCount:
        accumulator.interviewPendingCount + numberValue(item.interviewPendingCount),
      interviewWaivedCount:
        accumulator.interviewWaivedCount + numberValue(item.interviewWaivedCount)
    }),
    {
      totalApplications: 0,
      reviewedCount: 0,
      qualifiedCount: 0,
      pendingCount: 0,
      disqualifiedCount: 0,
      notReviewedCount: 0,
      interviewCompletedCount: 0,
      interviewScheduledCount: 0,
      interviewPendingCount: 0,
      interviewWaivedCount: 0
    }
  );

  return `
    <div class="college-breakdown">
      <div class="college-breakdown-heading">
        <span class="metric-label">College breakdown</span>
        <strong>${rows.length} college${rows.length === 1 ? "" : "s"}</strong>
      </div>
      <div class="table-wrap compact-table-wrap">
        <table>
          <thead>
            <tr>
              <th>College</th>
              <th>Applications</th>
              <th>Reviewed</th>
              <th>Qualified</th>
              <th>Pending</th>
              <th>Disqualified</th>
              <th>Yet to review</th>
              <th>Interviews</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.college || "Unknown / not captured")}</td>
                    <td>${numberValue(item.totalApplications)}</td>
                    <td>${numberValue(item.reviewedCount)}</td>
                    <td>${numberValue(item.qualifiedCount)}</td>
                    <td>${numberValue(item.pendingCount)}</td>
                    <td>${numberValue(item.disqualifiedCount)}</td>
                    <td>${numberValue(item.notReviewedCount)}</td>
                    <td>
                      Completed: ${numberValue(item.interviewCompletedCount)} |
                      Scheduled: ${numberValue(item.interviewScheduledCount)} |
                      Pending: ${numberValue(item.interviewPendingCount)} |
                      Waived: ${numberValue(item.interviewWaivedCount)}
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td>${totals.totalApplications}</td>
              <td>${totals.reviewedCount}</td>
              <td>${totals.qualifiedCount}</td>
              <td>${totals.pendingCount}</td>
              <td>${totals.disqualifiedCount}</td>
              <td>${totals.notReviewedCount}</td>
              <td>
                Completed: ${totals.interviewCompletedCount} |
                Scheduled: ${totals.interviewScheduledCount} |
                Pending: ${totals.interviewPendingCount} |
                Waived: ${totals.interviewWaivedCount}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

export function shouldSaveAcademicHistoryFromKeydown(event) {
  const key = event?.key;
  return (
    (key === "Enter" || key === "NumpadEnter") &&
    !event?.shiftKey &&
    !event?.ctrlKey &&
    !event?.altKey &&
    !event?.metaKey
  );
}
