export function createSessionRequestTracker(initialRequestId = 0) {
  return {
    currentRequestId: Math.max(0, Number(initialRequestId) || 0)
  };
}

export function beginSessionRequest(tracker) {
  const nextRequestId = (Number(tracker?.currentRequestId) || 0) + 1;
  if (tracker) {
    tracker.currentRequestId = nextRequestId;
  }
  return nextRequestId;
}

export function isCurrentSessionRequest(tracker, requestId) {
  return Number(tracker?.currentRequestId) === Number(requestId);
}
