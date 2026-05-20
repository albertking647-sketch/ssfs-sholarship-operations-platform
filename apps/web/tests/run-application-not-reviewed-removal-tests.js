import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appJs = readFileSync(resolve(__dirname, "../src/app.js"), "utf8");

function notReviewedExportCardIncludesRemoveAction() {
  assert.match(appJs, /data-application-remove-not-reviewed/u);
  assert.match(appJs, /Remove Yet to Review/u);
  assert.match(appJs, /item\.status === "not_reviewed"/u);
}

function removeActionCallsScopedDeleteEndpoint() {
  assert.match(appJs, /async function handleRemoveNotReviewedApplications/u);
  assert.match(appJs, /\/api\/applications\/not-reviewed\?\$\{query\.toString\(\)\}/u);
  assert.match(appJs, /method: "DELETE"/u);
  assert.match(appJs, /schemeId/u);
  assert.match(appJs, /cycleId/u);
}

function removeActionRefreshesExportsAndDashboard() {
  assert.match(appJs, /deletedCount/u);
  assert.match(appJs, /await loadApplicationReviewSummary\(\)/u);
  assert.match(appJs, /await loadDashboard\(\)/u);
}

notReviewedExportCardIncludesRemoveAction();
removeActionCallsScopedDeleteEndpoint();
removeActionRefreshesExportsAndDashboard();

console.log("application-not-reviewed-removal-tests: ok");
