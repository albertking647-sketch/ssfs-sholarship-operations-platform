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

function includesAppIconLink() {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/src\/assets\/app-icon\.svg" \/>/u);
}

function includesInlineSidebarBrandIcon() {
  assert.match(html, /class="brand-badge"[\s\S]*<svg/u);
  assert.doesNotMatch(html, /<img src="\/src\/assets\/app-icon\.svg"/u);
}

function includesClearMessagingHistoryAction() {
  assert.match(html, /id="applicationMessagingHistoryClearButton"/u);
  assert.match(html, /Clear history/u);
}

function usesOnlyApplicationImportsInVisibleForm() {
  assert.match(html, /<input id="applicationImportMode" type="hidden" value="applications" \/>/u);
  assert.doesNotMatch(html, /<select id="applicationImportMode"/u);
  assert.doesNotMatch(html, /Selected Applicants/u);
  assert.doesNotMatch(html, /Award List/u);
  assert.doesNotMatch(html, /value="waitlist_candidates"/u);
}

usesPostForNativeLoginSubmission();
doesNotIncludeBrowserManagedAuthTokenFields();
includesRestoreGateMarkup();
includesEarlyAuthBootScript();
includesPasswordVisibilityButtons();
includesPasswordRequirementGuidance();
includesAppIconLink();
includesInlineSidebarBrandIcon();
includesClearMessagingHistoryAction();
usesOnlyApplicationImportsInVisibleForm();

console.log("login-shell-markup-tests: ok");
