function normalizeMessage(message) {
  return String(message || "").trim().toLowerCase();
}

export function isAuthenticationSessionErrorMessage(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("bearer token is invalid") ||
    normalized.includes("authentication session is no longer valid") ||
    normalized.includes("authorization header must use the bearer scheme") ||
    normalized.includes("unauthorized")
  );
}

export function resolveSessionFailurePolicy({ session = null, errorMessage = "" } = {}) {
  const authenticated = Boolean(session?.authenticated && session?.actor);
  const authFailure = isAuthenticationSessionErrorMessage(errorMessage);

  return {
    clearStoredSession: authFailure,
    clearSessionState: authFailure || !authenticated,
    preserveAuthenticatedShell: authenticated && !authFailure
  };
}
