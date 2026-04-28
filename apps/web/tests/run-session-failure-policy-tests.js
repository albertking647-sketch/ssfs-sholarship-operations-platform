import assert from "node:assert/strict";

import {
  isAuthenticationSessionErrorMessage,
  resolveSessionFailurePolicy
} from "../src/sessionFailurePolicy.js";

function detectsAuthenticationSessionErrors() {
  assert.equal(
    isAuthenticationSessionErrorMessage("Authentication session is no longer valid."),
    true
  );
  assert.equal(
    isAuthenticationSessionErrorMessage("Unauthorized"),
    true
  );
  assert.equal(
    isAuthenticationSessionErrorMessage("Unable to load dashboard metrics."),
    false
  );
}

function preservesAuthenticatedShellForNonAuthFailures() {
  assert.deepEqual(
    resolveSessionFailurePolicy({
      session: {
        authenticated: true,
        actor: { username: "aeking", roleCode: "admin" }
      },
      errorMessage: "Unable to load dashboard metrics."
    }),
    {
      clearStoredSession: false,
      clearSessionState: false,
      preserveAuthenticatedShell: true
    }
  );
}

function clearsSessionForAuthenticationFailures() {
  assert.deepEqual(
    resolveSessionFailurePolicy({
      session: {
        authenticated: true,
        actor: { username: "aeking", roleCode: "admin" }
      },
      errorMessage: "Authentication session is no longer valid."
    }),
    {
      clearStoredSession: true,
      clearSessionState: true,
      preserveAuthenticatedShell: false
    }
  );
}

function unauthenticatedFailuresRemainLoggedOut() {
  assert.deepEqual(
    resolveSessionFailurePolicy({
      session: null,
      errorMessage: "The frontend could not reach the API."
    }),
    {
      clearStoredSession: false,
      clearSessionState: true,
      preserveAuthenticatedShell: false
    }
  );
}

detectsAuthenticationSessionErrors();
preservesAuthenticatedShellForNonAuthFailures();
clearsSessionForAuthenticationFailures();
unauthenticatedFailuresRemainLoggedOut();

console.log("session-failure-policy-tests: ok");
