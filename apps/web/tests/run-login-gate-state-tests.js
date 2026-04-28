import assert from "node:assert/strict";

import { showLoginGateMessage } from "../src/loginGateState.js";

function rendersLoginShellBeforeApplyingMessage() {
  const calls = [];

  showLoginGateMessage({
    message: "Username or password is incorrect.",
    renderAccessShell() {
      calls.push("render");
    },
    setLoginMessage(message, tone) {
      calls.push(`message:${tone}:${message}`);
    }
  });

  assert.deepEqual(calls, [
    "render",
    "message:error:Username or password is incorrect."
  ]);
}

rendersLoginShellBeforeApplyingMessage();

console.log("login-gate-state-tests: ok");
