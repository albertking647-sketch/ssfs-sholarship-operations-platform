import assert from "node:assert/strict";

import { createApplicationService } from "../src/modules/applications/service.js";

function createRepositories() {
  const students = [
    {
      id: "student-1",
      fullName: "Akosua Mensah",
      studentReferenceId: "20261234",
      indexNumber: "8637723",
      program: "Computer Engineering",
      year: "Year 2",
      cwa: 80
    },
    {
      id: "student-2",
      fullName: "Kwame Arthur",
      studentReferenceId: "20264321",
      indexNumber: "PG8637723",
      program: "Biochemistry",
      year: "Year 1",
      cwa: 70
    }
  ];

  return {
    schemes: {
      async getById(id) {
        return String(id) === "scheme-1" ? { id, name: "SRC KBN Bursary" } : null;
      }
    },
    cycles: {
      async getById(id) {
        return String(id) === "cycle-1"
          ? { id, label: "2026/2027 Academic Year", academicYearLabel: "2026/2027" }
          : null;
      }
    },
    applicationCriteria: {
      async getBySchemeCycle() {
        return null;
      }
    },
    students: {
      async findExistingByIdentifierBatch(identifiers = {}) {
        const byReferenceId = new Map();
        const byIndexNumber = new Map();

        for (const student of students) {
          if ((identifiers.studentReferenceIds || []).includes(student.studentReferenceId)) {
            byReferenceId.set(student.studentReferenceId, [student]);
          }
          if ((identifiers.indexNumbers || []).includes(student.indexNumber)) {
            byIndexNumber.set(student.indexNumber, [student]);
          }
        }

        return { byReferenceId, byIndexNumber };
      }
    },
    applications: {
      async findExistingForStudents() {
        return new Map();
      },
      async replaceImportIssues() {
        return [];
      }
    },
    audit: {
      async record() {}
    }
  };
}

async function applicationPreviewMatchesIndexNumberOnlyRows() {
  const service = createApplicationService({ repositories: createRepositories() });

  const preview = await service.previewImport({
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    importMode: "applications",
    rows: [
      {
        "Index Number": "8637723",
        "Full Name": "Akosua Mensah",
        Programme: "Computer Engineering"
      }
    ]
  });

  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.rows[0].matchedStudent.id, "student-1");
}

async function applicationPreviewRejectsConflictingReferenceAndIndexMatches() {
  const service = createApplicationService({ repositories: createRepositories() });

  const preview = await service.previewImport({
    schemeId: "scheme-1",
    cycleId: "cycle-1",
    importMode: "applications",
    rows: [
      {
        "Reference Number": "20261234",
        "Index Number": "PG8637723",
        "Full Name": "Akosua Mensah",
        Programme: "Computer Engineering"
      }
    ]
  });

  assert.equal(preview.summary.validRows, 0);
  assert.equal(preview.summary.invalidRows, 1);
  assert.match(preview.rows[0].issues.join(" "), /different registry students/i);
}

await applicationPreviewMatchesIndexNumberOnlyRows();
await applicationPreviewRejectsConflictingReferenceAndIndexMatches();

console.log("application-identifier-matching-tests: ok");
