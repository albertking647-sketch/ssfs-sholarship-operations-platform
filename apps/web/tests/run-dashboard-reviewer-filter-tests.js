import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appJs = readFileSync(resolve(__dirname, "../src/app.js"), "utf8");
const indexHtml = readFileSync(resolve(__dirname, "../index.html"), "utf8");

function reviewerLeaderboardFilterControlsRenderOnDashboard() {
  assert.match(indexHtml, /id="dashboardReviewerSchemeFilter"/u);
  assert.match(indexHtml, /id="dashboardReviewerAcademicYearFilter"/u);
  assert.match(indexHtml, /id="dashboardReviewerResetButton"/u);
  assert.match(appJs, /function renderDashboardReviewerFilterOptions/u);
}

function dashboardRequestIncludesReviewerFilterParams() {
  assert.match(appJs, /reviewerSchemeId/u);
  assert.match(appJs, /reviewerAcademicYearLabel/u);
  assert.match(appJs, /dashboardUrl\.searchParams\.set\("reviewerSchemeId"/u);
  assert.match(appJs, /dashboardUrl\.searchParams\.set\("reviewerAcademicYearLabel"/u);
}

function resetClearsReviewerLeaderboardFilters() {
  assert.match(appJs, /function resetDashboardReviewerFilters/u);
  assert.match(appJs, /dashboardReviewerResetButton\?\.addEventListener\("click"/u);
  assert.match(appJs, /state\.dashboardReviewerFilters = \{ schemeId: "", academicYearLabel: "" \}/u);
}

reviewerLeaderboardFilterControlsRenderOnDashboard();
dashboardRequestIncludesReviewerFilterParams();
resetClearsReviewerLeaderboardFilters();

console.log("dashboard-reviewer-filter-tests: ok");
