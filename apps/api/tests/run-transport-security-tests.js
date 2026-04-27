import assert from "node:assert/strict";
import fs from "node:fs";

function apiProxyDoesNotDisableTlsVerificationInline() {
  const source = fs.readFileSync(new URL("../../web/src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/u);
}

function databaseClientDoesNotDisableTlsVerificationInline() {
  const source = fs.readFileSync(
    new URL("../src/infra/database/client.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/u);
}

apiProxyDoesNotDisableTlsVerificationInline();
databaseClientDoesNotDisableTlsVerificationInline();

console.log("transport-security-tests: ok");
