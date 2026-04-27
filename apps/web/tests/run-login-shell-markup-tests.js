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

function includesRestoreGateMarkup() {
  assert.match(html, /id="restoreGate"/u);
}

function includesEarlyAuthBootScript() {
  assert.match(html, /ssfs-auth-session-token/u);
  assert.match(html, /document\.documentElement\.dataset\.authBoot/u);
}

usesPostForNativeLoginSubmission();
includesRestoreGateMarkup();
includesEarlyAuthBootScript();

console.log("login-shell-markup-tests: ok");
