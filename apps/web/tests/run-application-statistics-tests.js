import assert from "node:assert/strict";

import {
  renderApplicationCollegeBreakdownMarkup,
  shouldSaveAcademicHistoryFromKeydown
} from "../src/applicationStatistics.js";

function rendersCollegeBreakdownRows() {
  const markup = renderApplicationCollegeBreakdownMarkup({
    collegeBreakdown: [
      {
        college: "Engineering",
        totalApplications: 12,
        reviewedCount: 8,
        qualifiedCount: 5,
        pendingCount: 1,
        disqualifiedCount: 2,
        notReviewedCount: 4,
        interviewPendingCount: 3,
        interviewScheduledCount: 2,
        interviewCompletedCount: 6,
        interviewWaivedCount: 1
      }
    ]
  });

  assert.match(markup, /College breakdown/);
  assert.match(markup, /Engineering/);
  assert.match(markup, /Completed: 6/);
  assert.match(markup, /Scheduled: 2/);
  assert.match(markup, /Yet to review/);
}

function savesAcademicHistoryOnPlainEnterOnly() {
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Enter" }), true);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "NumpadEnter" }), true);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Tab" }), false);
}

rendersCollegeBreakdownRows();
savesAcademicHistoryOnPlainEnterOnly();

console.log("application-statistics-tests: ok");
