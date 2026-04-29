import assert from "node:assert/strict";

import {
  getAcademicHistoryScopeSemesters,
  normalizeAcademicHistoryImportScopeOptions
} from "../src/academicHistoryScopeOptions.js";

function groupsImportedSemestersUnderAcademicYears() {
  const options = normalizeAcademicHistoryImportScopeOptions({
    items: [
      {
        academicYearLabel: "2031/2032 Academic Year",
        semesters: ["Second Semester"]
      },
      {
        academicYearLabel: "2032/2033 Academic Year",
        semesters: ["First Semester", "Final Results", "First Semester"]
      }
    ]
  });

  assert.deepEqual(options, {
    totalAcademicYears: 2,
    items: [
      {
        academicYearLabel: "2032/2033 Academic Year",
        semesters: ["Final Results", "First Semester"]
      },
      {
        academicYearLabel: "2031/2032 Academic Year",
        semesters: ["Second Semester"]
      }
    ]
  });
}

function returnsDependentSemesterOptionsForSelectedYear() {
  const options = normalizeAcademicHistoryImportScopeOptions({
    items: [
      {
        academicYearLabel: "2032/2033 Academic Year",
        semesters: ["First Semester", "Final Results"]
      },
      {
        academicYearLabel: "2031/2032 Academic Year",
        semesters: ["Second Semester"]
      }
    ]
  });

  assert.deepEqual(
    getAcademicHistoryScopeSemesters(options, "2032/2033 Academic Year"),
    ["Final Results", "First Semester"]
  );
  assert.deepEqual(getAcademicHistoryScopeSemesters(options, "2030/2031 Academic Year"), []);
}

groupsImportedSemestersUnderAcademicYears();
returnsDependentSemesterOptionsForSelectedYear();

console.log("academic-history-scope-options-tests: ok");
