import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtmlPath = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(indexHtmlPath, "utf8");

function usesPostForNativeLoginSubmission() {
  assert.match(html, /<form id="loginForm" class="login-form" method="post">/u);
}

function doesNotIncludeBrowserManagedAuthTokenFields() {
  assert.doesNotMatch(html, /id="authToken"/u);
}

function includesRestoreGateMarkup() {
  assert.match(html, /id="restoreGate"/u);
}

function includesEarlyAuthBootScript() {
  assert.match(html, /ssfs-auth-session-active/u);
  assert.match(html, /document\.documentElement\.dataset\.authBoot/u);
}

function includesPasswordVisibilityButtons() {
  assert.match(html, /id="loginPasswordToggle"/u);
  assert.match(html, /id="accessPasswordToggle"/u);
}

function includesPasswordRequirementGuidance() {
  assert.match(
    html,
    /Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters\./u
  );
}

usesPostForNativeLoginSubmission();
doesNotIncludeBrowserManagedAuthTokenFields();
includesRestoreGateMarkup();
includesEarlyAuthBootScript();
includesPasswordVisibilityButtons();
includesPasswordRequirementGuidance();

console.log("login-shell-markup-tests: ok");
