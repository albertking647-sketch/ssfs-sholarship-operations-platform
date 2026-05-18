import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJs = fs.readFileSync(path.resolve(__dirname, "..", "src", "app.js"), "utf8");
const styles = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

function hasSharedStreamingImportHelper() {
  assert.match(appJs, /async function postImportWithProgress\(/u);
  assert.match(appJs, /Accept": "application\/x-ndjson"/u);
  assert.match(appJs, /function renderImportProgress\(/u);
  assert.match(styles, /\.import-progress/u);
  assert.match(styles, /\.import-progress-fill/u);
}

function allFileImportPostersUseProgressHelper() {
  const helpers = [
    "postImport",
    "postAcademicHistoryImport",
    "postApplicationsImport",
    "postApplicationInterviewImport",
    "postBeneficiaryImport",
    "postRecommendedImport"
  ];

  for (const helper of helpers) {
    const match = appJs.match(new RegExp(`async function ${helper}\\([\\s\\S]*?\\n\\}`, "u"));
    assert.ok(match, `${helper} should exist.`);
    assert.match(match[0], /postImportWithProgress/u, `${helper} should use progress helper.`);
  }

  const supportImportMatch = appJs.match(/async function handleSupportFoodBankImport\([\s\S]*?\n\}/u);
  assert.ok(supportImportMatch, "handleSupportFoodBankImport should exist.");
  assert.match(supportImportMatch[0], /postImportWithProgress/u);
}

function cwaImportReusesPreviewRowsInsteadOfReuploadingWorkbooks() {
  const postHelperMatch = appJs.match(
    /async function postAcademicHistoryImport\(endpoint[\s\S]*?\n\}/u
  );
  assert.ok(postHelperMatch, "postAcademicHistoryImport should exist.");
  assert.match(postHelperMatch[0], /state\.academicHistoryPreview\?\.importRows/u);
  assert.match(postHelperMatch[0], /"Content-Type": "application\/json"/u);
  assert.match(postHelperMatch[0], /Run a fresh CWA preview/u);
  assert.match(postHelperMatch[0], /usePreviewRows && !previewImportRows\.length/u);

  const importHandlerMatch = appJs.match(/async function handleAcademicHistoryImport\([\s\S]*?\n\}/u);
  assert.ok(importHandlerMatch, "handleAcademicHistoryImport should exist.");
  assert.match(importHandlerMatch[0], /usePreviewRows: true/u);
  assert.match(importHandlerMatch[0], /clearImportProgress\(elements\.academicHistoryMessage\)/u);
}

function importProgressDisplaysOfRowsLabel() {
  assert.ok(
    appJs.includes("`${processedRows.toLocaleString()} of ${totalRows.toLocaleString()} rows`"),
    "Import progress should display row counts as '1 of N rows'."
  );
}

hasSharedStreamingImportHelper();
allFileImportPostersUseProgressHelper();
cwaImportReusesPreviewRowsInsteadOfReuploadingWorkbooks();
importProgressDisplaysOfRowsLabel();

console.log("import-progress-ui-tests: ok");
