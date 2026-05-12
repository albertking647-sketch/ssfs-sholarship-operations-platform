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

function rendersCollegeBreakdownTotalsRow() {
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
      },
      {
        college: "Science",
        totalApplications: 7,
        reviewedCount: 4,
        qualifiedCount: 2,
        pendingCount: 2,
        disqualifiedCount: 0,
        notReviewedCount: 3,
        interviewPendingCount: 1,
        interviewScheduledCount: 1,
        interviewCompletedCount: 2,
        interviewWaivedCount: 0
      }
    ]
  });

  assert.match(markup, /<tfoot>/);
  assert.match(markup, /Totals/);
  assert.match(markup, /<td>19<\/td>/);
  assert.match(markup, /<td>12<\/td>/);
  assert.match(markup, /<td>7<\/td>/);
  assert.match(markup, /<td>3<\/td>/);
  assert.match(markup, /<td>2<\/td>/);
  assert.match(markup, /<td>7<\/td>/);
  assert.match(markup, /Completed: 8/);
  assert.match(markup, /Scheduled: 3/);
  assert.match(markup, /Pending: 4/);
  assert.match(markup, /Waived: 1/);
}

function savesAcademicHistoryOnPlainEnterOnly() {
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Enter" }), true);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "NumpadEnter" }), true);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSaveAcademicHistoryFromKeydown({ key: "Tab" }), false);
}

rendersCollegeBreakdownRows();
rendersCollegeBreakdownTotalsRow();
savesAcademicHistoryOnPlainEnterOnly();

console.log("application-statistics-tests: ok");
