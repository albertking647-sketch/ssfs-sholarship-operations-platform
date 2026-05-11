import assert from "node:assert/strict";

import { createApplicationRepository } from "../src/modules/applications/repository.js";

async function summaryIncludesCollegeDecisionAndInterviewBreakdown() {
  const repository = createApplicationRepository({
    database: {
      enabled: false
    }
  });

  const items = await repository.list({});
  const summary = await repository.summary({});
  const expectedByCollege = new Map();

  for (const item of items) {
    const college = item.college || "Unknown / not captured";
    const existing =
      expectedByCollege.get(college) ||
      {
        college,
        totalApplications: 0,
        reviewedCount: 0,
        qualifiedCount: 0,
        pendingCount: 0,
        disqualifiedCount: 0,
        notReviewedCount: 0,
        interviewPendingCount: 0,
        interviewScheduledCount: 0,
        interviewCompletedCount: 0,
        interviewWaivedCount: 0
      };
    existing.totalApplications += 1;
    if (item.qualificationStatus !== "not_reviewed") existing.reviewedCount += 1;
    if (item.qualificationStatus === "qualified") existing.qualifiedCount += 1;
    if (item.qualificationStatus === "pending") existing.pendingCount += 1;
    if (item.qualificationStatus === "disqualified") existing.disqualifiedCount += 1;
    if (item.qualificationStatus === "not_reviewed") existing.notReviewedCount += 1;
    if (!item.interviewStatus || item.interviewStatus === "pending") existing.interviewPendingCount += 1;
    if (item.interviewStatus === "scheduled") existing.interviewScheduledCount += 1;
    if (item.interviewStatus === "completed") existing.interviewCompletedCount += 1;
    if (item.interviewStatus === "waived") existing.interviewWaivedCount += 1;
    expectedByCollege.set(college, existing);
  }

  assert.equal(summary.totalApplications, items.length);
  assert.ok(Array.isArray(summary.collegeBreakdown));
  assert.equal(summary.collegeBreakdown.length, expectedByCollege.size);

  for (const expected of expectedByCollege.values()) {
    const actual = summary.collegeBreakdown.find((item) => item.college === expected.college);
    assert.deepEqual(actual, expected);
  }
}

await summaryIncludesCollegeDecisionAndInterviewBreakdown();

console.log("application-summary-breakdown-tests: ok");
