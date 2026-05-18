import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function loginSubmitHasBoundedNetworkWait() {
  const loginHandlerMatch = appSource.match(
    /async function handleLoginSubmit\(event\) \{[\s\S]*?\n\}/u
  );

  assert.ok(loginHandlerMatch, "Expected login submit handler.");
  assert.match(appSource, /LOGIN_REQUEST_TIMEOUT_MS/u);
  assert.match(loginHandlerMatch[0], /fetchJsonWithTimeout/u);
  assert.match(loginHandlerMatch[0], /Sign-in is taking too long/u);
  assert.doesNotMatch(
    loginHandlerMatch[0],
    /const response = await fetch\(/u,
    "Login submit should not leave the UI waiting forever on a raw fetch."
  );
}

function loginSubmitUsesCurrentWebOrigin() {
  const loginHandlerMatch = appSource.match(
    /async function handleLoginSubmit\(event\) \{[\s\S]*?\n\}/u
  );

  assert.ok(loginHandlerMatch, "Expected login submit handler.");
  assert.match(appSource, /function getLoginApiBaseUrl\(\)/u);
  assert.match(loginHandlerMatch[0], /getLoginApiBaseUrl\(\)/u);
  assert.doesNotMatch(
    loginHandlerMatch[0],
    /String\(elements\.loginApiUrl\?\.value/,
    "Login should use the current web origin instead of a stale hidden API URL."
  );
}

loginSubmitHasBoundedNetworkWait();
loginSubmitUsesCurrentWebOrigin();

console.log("login-submit-timeout-tests: ok");
