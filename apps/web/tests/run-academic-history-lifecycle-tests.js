import assert from "node:assert/strict";
import fs from "node:fs";

import {
  renderAcademicHistoryImportHistoryMarkup,
  renderAcademicHistoryResultsMarkup
} from "../src/academicHistoryLifecycle.js";

function adminMarkupIncludesLifecycleActions() {
  const markup = renderAcademicHistoryResultsMarkup(
    [
      {
        id: "history-1",
        studentId: "student-1",
        studentName: "Akosua Mensah",
        studentReferenceId: "20261234",
        indexNumber: "8637723",
        college: "Engineering",
        program: "Computer Engineering",
        academicYearLabel: "2032/2033 Academic Year",
        semesterLabel: "First Semester",
        cwa: 75,
        importBatchReference: "batch-1",
        sourceFileName: "cwa.xlsx"
      }
    ],
    {
      canManageLifecycle: true
    }
  );

  assert.match(markup, /data-academic-history-edit="history-1"/);
  assert.match(markup, /data-academic-history-delete="history-1"/);
  assert.match(markup, /Imported/);
}

function readOnlyMarkupOmitsLifecycleActions() {
  const markup = renderAcademicHistoryResultsMarkup(
    [
      {
        id: "history-2",
        studentId: "student-2",
        studentName: "Kwame Arthur",
        studentReferenceId: "20264321",
        indexNumber: "PG8637723",
        college: "Science",
        program: "Biochemistry",
        academicYearLabel: "2032/2033 Academic Year",
        semesterLabel: "First Semester",
        cwa: 68
      }
    ],
    {
      canManageLifecycle: false
    }
  );

  assert.doesNotMatch(markup, /data-academic-history-edit=/);
  assert.doesNotMatch(markup, /data-academic-history-delete=/);
}

function importHistoryMarkupShowsRollbackAvailability() {
  const markup = renderAcademicHistoryImportHistoryMarkup({
    total: 2,
    items: [
      {
        batchReference: "batch-1",
        academicYearLabel: "2032/2033 Academic Year",
        semesterLabel: "First Semester",
        fileName: "cwa-first.xlsx",
        importedRows: 10,
        updatedRows: 2,
        status: "completed"
      },
      {
        batchReference: "batch-2",
        academicYearLabel: "2031/2032 Academic Year",
        semesterLabel: "Final Results",
        fileName: "cwa-final.xlsx",
        importedRows: 8,
        updatedRows: 0,
        status: "rolled_back",
        rollbackReason: "Wrong workbook"
      }
    ]
  });

  assert.match(markup, /data-academic-history-rollback="batch-1"/);
  assert.match(markup, /Delete batch records/);
  assert.doesNotMatch(markup, /data-academic-history-rollback="batch-2"/);
  assert.match(markup, /Wrong workbook/);
}

function importHistoryMarkupExplainsScopeRecordsWithoutBatchLogs() {
  const markup = renderAcademicHistoryImportHistoryMarkup({
    total: 0,
    academicYearLabel: "2025/2026",
    semesterLabel: "Manual review entry",
    scopeRecordTotal: 32,
    scopeRecords: [
      {
        studentName: "Akosua Mensah",
        indexNumber: "8637723",
        cwa: 76
      }
    ],
    items: []
  });

  assert.match(markup, /32 academic history record/);
  assert.match(markup, /No batch log/);
  assert.match(markup, /Manual review entry means/);
  assert.match(markup, /Clear selected scope/);
}

function academicHistoryClearUsesInlineConfirmation() {
  const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /academicHistoryClearConfirmation/u);
  assert.match(appSource, /Confirm clear scope/u);
  assert.doesNotMatch(appSource, /Type CLEAR ACADEMIC HISTORY/u);
}

function academicHistoryBatchDeleteDoesNotDependOnPrompt() {
  const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const rollbackHandlerMatch = appSource.match(
    /async function handleAcademicHistoryRollback\(batchReference[\s\S]*?\n\}/u
  );

  assert.ok(rollbackHandlerMatch, "Expected academic history rollback handler.");
  assert.doesNotMatch(rollbackHandlerMatch[0], /window\.prompt/u);
  assert.match(rollbackHandlerMatch[0], /Deleted records from academic history import batch/u);
  assert.match(appSource, /ACADEMIC_HISTORY_ROLLBACK_TIMEOUT_MS/u);
  assert.match(rollbackHandlerMatch[0], /fetchJsonWithTimeout/u);
  assert.doesNotMatch(rollbackHandlerMatch[0], /await loadAcademicHistory\(\)/u);
}

function academicHistoryTimelineCanBeCollapsed() {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(html, /id="academicHistoryTimelineToggleButton"/);
  assert.match(html, /id="academicHistoryTimelineBody"/);
  assert.match(appSource, /ACADEMIC_HISTORY_TIMELINE_HIDDEN_KEY/);
  assert.match(appSource, /function renderAcademicHistoryTimelineVisibility/);
  assert.match(appSource, /Show timeline/);
  assert.match(appSource, /Hide timeline/);
}

adminMarkupIncludesLifecycleActions();
readOnlyMarkupOmitsLifecycleActions();
importHistoryMarkupShowsRollbackAvailability();
importHistoryMarkupExplainsScopeRecordsWithoutBatchLogs();
academicHistoryClearUsesInlineConfirmation();
academicHistoryBatchDeleteDoesNotDependOnPrompt();
academicHistoryTimelineCanBeCollapsed();

console.log("academic-history-lifecycle-tests: ok");
