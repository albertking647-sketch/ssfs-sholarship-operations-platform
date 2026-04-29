import assert from "node:assert/strict";

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
        indexNumber: "ENG/24/001",
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
        indexNumber: "SCI\/24\/015",
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
  assert.doesNotMatch(markup, /data-academic-history-rollback="batch-2"/);
  assert.match(markup, /Wrong workbook/);
}

adminMarkupIncludesLifecycleActions();
readOnlyMarkupOmitsLifecycleActions();
importHistoryMarkupShowsRollbackAvailability();

console.log("academic-history-lifecycle-tests: ok");
