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
const beneficiarySchemeExportPath = path.join(
  workspaceRoot,
  "apps",
  "api",
  "src",
  "modules",
  "reports",
  "beneficiarySchemeExportWorkbook.js"
);
const beneficiarySummaryExportPath = path.join(
  workspaceRoot,
  "apps",
  "api",
  "src",
  "modules",
  "reports",
  "beneficiarySummaryExportWorkbook.js"
);

const html = fs.readFileSync(indexHtmlPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");
const userManual = fs.readFileSync(userManualPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");
const beneficiarySchemeExport = fs.readFileSync(beneficiarySchemeExportPath, "utf8");
const beneficiarySummaryExport = fs.readFileSync(beneficiarySummaryExportPath, "utf8");

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

function documentsCwaImportRequirementsAndUpdateBehavior() {
  assert.match(html, /Required workbook fields: Student ID or Index Number, Name or Full Name, and CWA/u);
  assert.match(html, /SIS-style files require selecting or typing an academic year/u);
  assert.match(html, /Existing CWA for the same student, academic year, semester, and program is updated/u);
}

function cwaImportOffersAcademicYearSelectAndManualEntry() {
  assert.match(html, /<select id="academicHistoryAcademicYearSelect" class="select-field">/u);
  assert.match(html, /<option value="__manual__">Type academic year manually<\/option>/u);
  assert.match(html, /id="academicHistoryAcademicYearManualInput"/u);
  assert.match(appJs, /function renderAcademicHistoryAcademicYearOptions/u);
  assert.match(appJs, /academicHistoryAcademicYearManualInput/u);
  assert.match(appJs, /2024\/2025/u);
}

function cwaImportUsesFirstAndSecondSemesterOnlyWithSecondAsDefault() {
  const selectMatch = html.match(
    /<select id="academicHistorySemesterLabel" class="select-field">([\s\S]*?)<\/select>/u
  );
  assert.ok(selectMatch, "Academic history semester select should exist.");
  const optionMatches = [...selectMatch[1].matchAll(/<option value="([^"]+)"([^>]*)>/gu)];

  assert.deepEqual(
    optionMatches.map((match) => match[1]),
    ["First Semester", "Second Semester"]
  );
  assert.match(optionMatches[1][2], /\bselected\b/u);
}

function cwaImportPreviewDoesNotFallbackToRegistryProgram() {
  const functionMatch = appJs.match(
    /function renderAcademicHistoryValidRows\(rows\) \{[\s\S]*?\n\}/u
  );
  assert.ok(functionMatch, "Academic history preview row renderer should exist.");
  assert.doesNotMatch(functionMatch[0], /payload\.program \|\| row\.matchedStudent\?\.program/u);
}

function registryHistoryRouteLoadsAcademicYearOptions() {
  const routeLoadMatch = appJs.match(
    /if \(route\.module === "registry"\) \{[\s\S]*?if \(route\.module === "applications"\)/u
  );
  assert.ok(routeLoadMatch, "Registry route data loader should exist.");
  assert.match(routeLoadMatch[0], /loadApplicationOptions\(\)/u);
}

function alignsBeneficiarySupportTypeAndCurrencyGuidance() {
  assert.match(html, /Support type is required and must be Internal or External/u);
  assert.match(html, /<option value="GBP">GBP<\/option>/u);
  assert.match(userManual, /- Support Type/u);
  assert.doesNotMatch(userManual, /Strongly expected:\s*\n\s*\n- Support Type/u);
}

function usesBeneficiaryStreamLanguage() {
  assert.match(html, /Beneficiary stream/u);
  assert.match(html, /<option value="single_cycle">Single Cycle<\/option>/u);
  assert.match(appJs, /Single Cycle/u);
  assert.doesNotMatch(html, /Beneficiary cohort/u);
  assert.doesNotMatch(html, /Not tagged/u);
  assert.doesNotMatch(appJs, /Not tagged/u);
  assert.doesNotMatch(
    beneficiarySchemeExport,
    /Beneficiary Cohort|Current Beneficiaries|New Beneficiaries|Not Tagged/u
  );
  assert.doesNotMatch(beneficiarySummaryExport, /Current Cohort|New Cohort|Not Tagged/u);
}

function letsRecommendedBeneficiarySupportUseAvailableSupportOptions() {
  assert.match(html, /<select id="recommendedSupportName" class="select-field">/u);
  assert.doesNotMatch(html, /<input id="recommendedSupportName"/u);
  assert.match(appJs, /function renderRecommendedBeneficiarySupportOptions/u);
  assert.match(appJs, /state\.beneficiaryFilterOptions\?\.schemeNames/u);
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
documentsCwaImportRequirementsAndUpdateBehavior();
cwaImportOffersAcademicYearSelectAndManualEntry();
cwaImportUsesFirstAndSecondSemesterOnlyWithSecondAsDefault();
cwaImportPreviewDoesNotFallbackToRegistryProgram();
registryHistoryRouteLoadsAcademicYearOptions();
alignsBeneficiarySupportTypeAndCurrencyGuidance();
usesBeneficiaryStreamLanguage();
letsRecommendedBeneficiarySupportUseAvailableSupportOptions();
keepsReadmeCurrentWithImplementedWorkflows();

console.log("copy-consistency-tests: ok");
