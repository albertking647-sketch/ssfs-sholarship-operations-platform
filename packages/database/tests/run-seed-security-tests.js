import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function seedScriptDoesNotShipPlaceholderPasswordHashes() {
  const source = readFileSync(new URL("../scripts/seed.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /seed-dev-token-placeholder/u);
}

function readmeDoesNotPromoteDemoBearerTokensAsNormalAuth() {
  const source = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

  assert.doesNotMatch(source, /admin-demo-token|reviewer-demo-token|auditor-demo-token/u);
}

seedScriptDoesNotShipPlaceholderPasswordHashes();
readmeDoesNotPromoteDemoBearerTokensAsNormalAuth();

console.log("seed-security-tests: ok");
