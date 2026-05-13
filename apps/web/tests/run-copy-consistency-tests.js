import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const indexHtmlPath = path.resolve(__dirname, "..", "index.html");
const appJsPath = path.resolve(__dirname, "..", "src", "app.js");
const userManualPath = path.join(workspaceRoot, "docs", "user-manual.md");
const readmePath = path.join(workspaceRoot, "README.md");

const html = fs.readFileSync(indexHtmlPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");
const userManual = fs.readFileSync(userManualPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

function describesActiveModulesInPresentTense() {
  assert.doesNotMatch(appJs, /first working module/u);
  assert.doesNotMatch(appJs, /This module will handle/u);
  assert.doesNotMatch(appJs, /This module will manage/u);
  assert.doesNotMatch(appJs, /This module will bring/u);
}

function documentsStudentImportRequirementsAccurately() {
  assert.match(html, /Upload one or more college class-list files in \.csv or \.xlsx format/u);
  assert.match(
    html,
    /Full name, student reference ID, college, program, and year are required on every row/u
  );
  assert.doesNotMatch(html, /Academic year, support name, full name, student reference ID, amount paid, and support type/u);
}

function usesRealisticIndexNumberExamples() {
  assert.doesNotMatch(html, /ENG\/24\/001/u);
  assert.match(html, /placeholder="8637723 or PG8637723"/u);
}

function alignsRecommendedStudentIdentifierGuidance() {
  assert.match(html, /Required fields: Academic Year, Scheme Name, and Student ID \/ Reference Number or Index Number/u);
}

function alignsBeneficiarySupportTypeAndCurrencyGuidance() {
  assert.match(html, /Support type is required and must be Internal or External/u);
  assert.match(html, /<option value="GBP">GBP<\/option>/u);
  assert.match(userManual, /- Support Type/u);
  assert.doesNotMatch(userManual, /Strongly expected:\s*\n\s*\n- Support Type/u);
}

function keepsReadmeCurrentWithImplementedWorkflows() {
  assert.doesNotMatch(readme, /fresh project scaffold/u);
  assert.doesNotMatch(readme, /core web shell/u);
  assert.doesNotMatch(readme, /scholarship-operations-platform/u);
  assert.doesNotMatch(readme, /before adding full binary `\.xlsx` upload handling/u);
  assert.doesNotMatch(readme, /Add Excel import and export jobs for application intake and reporting/u);
  assert.doesNotMatch(userManual, /student-verification-suite/u);
  assert.match(userManual, /ssfs-scholarship-operations-hub/u);
}

describesActiveModulesInPresentTense();
documentsStudentImportRequirementsAccurately();
usesRealisticIndexNumberExamples();
alignsRecommendedStudentIdentifierGuidance();
alignsBeneficiarySupportTypeAndCurrencyGuidance();
keepsReadmeCurrentWithImplementedWorkflows();

console.log("copy-consistency-tests: ok");
