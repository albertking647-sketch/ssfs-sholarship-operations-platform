import assert from "node:assert/strict";

import {
  beginSessionRequest,
  createSessionRequestTracker,
  isCurrentSessionRequest
} from "../src/sessionRequestTracker.js";

function createsMonotonicRequestTokens() {
  const tracker = createSessionRequestTracker();
  const first = beginSessionRequest(tracker);
  const second = beginSessionRequest(tracker);

  assert.equal(first, 1);
  assert.equal(second, 2);
}

function marksOnlyNewestRequestAsCurrent() {
  const tracker = createSessionRequestTracker();
  const first = beginSessionRequest(tracker);
  const second = beginSessionRequest(tracker);

  assert.equal(isCurrentSessionRequest(tracker, first), false);
  assert.equal(isCurrentSessionRequest(tracker, second), true);
}

function preservesCurrentRequestUntilAnotherBegins() {
  const tracker = createSessionRequestTracker();
  const current = beginSessionRequest(tracker);

  assert.equal(isCurrentSessionRequest(tracker, current), true);
}

createsMonotonicRequestTokens();
marksOnlyNewestRequestAsCurrent();
preservesCurrentRequestUntilAnotherBegins();

console.log("session-request-tracker-tests: ok");
