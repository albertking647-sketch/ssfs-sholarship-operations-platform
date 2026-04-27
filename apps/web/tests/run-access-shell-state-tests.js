import assert from "node:assert/strict";

import {
  buildAccessShellState,
  shouldAttemptSessionRestore
} from "../src/accessShellState.js";

function attemptsSessionRestoreWhenTokenExists() {
  assert.equal(shouldAttemptSessionRestore(""), false);
  assert.equal(shouldAttemptSessionRestore("   "), false);
  assert.equal(shouldAttemptSessionRestore("token-123"), true);
}

function hidesLoginFormWhileSessionRestoreIsPending() {
  assert.deepEqual(
    buildAccessShellState({
      authenticated: false,
      sessionRestorePending: true
    }),
    {
      loginGateHidden: false,
      loginFormHidden: true,
      appShellHidden: true,
      logoutHidden: true,
      loginMessage: "Restoring your previous sign-in...",
      loginTone: "warning"
    }
  );
}

function showsAppShellWhenAuthenticated() {
  assert.deepEqual(
    buildAccessShellState({
      authenticated: true,
      sessionRestorePending: false
    }),
    {
      loginGateHidden: true,
      loginFormHidden: false,
      appShellHidden: false,
      logoutHidden: false,
      loginMessage: "",
      loginTone: ""
    }
  );
}

function showsNormalLoginWhenNoSessionExists() {
  assert.deepEqual(
    buildAccessShellState({
      authenticated: false,
      sessionRestorePending: false
    }),
    {
      loginGateHidden: false,
      loginFormHidden: false,
      appShellHidden: true,
      logoutHidden: true,
      loginMessage: "Enter your username and password to continue.",
      loginTone: ""
    }
  );
}

attemptsSessionRestoreWhenTokenExists();
hidesLoginFormWhileSessionRestoreIsPending();
showsAppShellWhenAuthenticated();
showsNormalLoginWhenNoSessionExists();

console.log("access-shell-state-tests: ok");
