import assert from "node:assert/strict";

import { createStudentRepository } from "../src/modules/students/repository.js";
import { createStudentService } from "../src/modules/students/service.js";

function createRepositories() {
  const auditEvents = [];

  const repositories = {
    students: createStudentRepository({
      database: {
        enabled: false
      }
    }),
    cycles: {
      async list() {
        return [];
      }
    },
    audit: {
      async record(event) {
        auditEvents.push(event);
        return event;
      }
    }
  };

  return {
    repositories,
    auditEvents
  };
}

async function importRollbackRestoresUpdatedAcademicHistoryRecord() {
  const { repositories, auditEvents } = createRepositories();
  const service = createStudentService({ repositories });

  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    cycleId: null,
    college: "Engineering",
    program: "Computer Engineering",
    year: "Year 2",
    academicYearLabel: "2031/2032 Academic Year",
    semesterLabel: "Final Results",
    cwa: 70
  });

  const imported = await service.importAcademicHistoryRows(
    {
      fileName: "cwa-update.xlsx",
      academicYearLabel: "2031/2032 Academic Year",
      semesterLabel: "Final Results",
      rows: [
        {
          "Index Number": "ENG/24/001",
          "Full Name": "Akosua Mensah",
          "Academic Year": "2031/2032 Academic Year",
          "Semester Label": "Final Results",
          CWA: 82
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(imported.summary.importedRows, 1);

  const history = await service.getAcademicHistoryImportHistory({
    academicYearLabel: "2031/2032 Academic Year",
    semesterLabel: "Final Results"
  });

  assert.equal(history.total, 1);
  assert.equal(history.items[0].status, "completed");
  assert.equal(history.items[0].updatedRows, 1);

  const rollback = await service.rollbackAcademicHistoryImportBatch(
    {
      batchReference: history.items[0].batchReference,
      reason: "Imported the wrong workbook"
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(rollback.restoredRows, 1);
  assert.equal(rollback.deletedRows, 0);

  const restored = (
    await repositories.students.listAcademicHistory({ studentId: "student-001" })
  ).find(
    (item) =>
      item.academicYearLabel === "2031/2032 Academic Year" &&
      item.semesterLabel === "Final Results"
  );

  assert.equal(restored?.cwa, 70);
  assert.ok(
    auditEvents.some(
      (event) =>
        event.actionCode === "student_registry.academic_history_import_rolled_back" &&
        event.entityId === history.items[0].batchReference
    )
  );
}

async function updateDeleteAndClearAcademicHistoryRecords() {
  const { repositories, auditEvents } = createRepositories();
  const service = createStudentService({ repositories });

  await service.importAcademicHistoryRows(
    {
      fileName: "scope-history.xlsx",
      academicYearLabel: "2032/2033 Academic Year",
      semesterLabel: "First Semester",
      rows: [
        {
          "Index Number": "ENG/24/001",
          "Full Name": "Akosua Mensah",
          "Academic Year": "2032/2033 Academic Year",
          "Semester Label": "First Semester",
          CWA: 75
        },
        {
          "Index Number": "SCI/24/015",
          "Full Name": "Kwame Arthur",
          "Academic Year": "2032/2033 Academic Year",
          "Semester Label": "First Semester",
          CWA: 68
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const records = (await repositories.students.listAcademicHistory({})).filter(
    (item) =>
      item.academicYearLabel === "2032/2033 Academic Year" &&
      item.semesterLabel === "First Semester"
  );

  assert.equal(records.length, 2);

  const updated = await service.updateAcademicHistoryRecord(
    records[0].id,
    {
      cwa: 88,
      reason: "Corrected imported CWA"
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(updated.item.cwa, 88);

  await service.deleteAcademicHistoryRecord(
    records[1].id,
    {
      reason: "Remove duplicate academic history row"
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const clearResult = await service.clearAcademicHistoryScope(
    {
      academicYearLabel: "2032/2033 Academic Year",
      semesterLabel: "First Semester",
      reason: "Reset this imported semester"
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(clearResult.summary.deletedRows, 1);

  const remaining = (await repositories.students.listAcademicHistory({})).filter(
    (item) =>
      item.academicYearLabel === "2032/2033 Academic Year" &&
      item.semesterLabel === "First Semester"
  );

  assert.equal(remaining.length, 0);
  assert.ok(
    auditEvents.some((event) => event.actionCode === "student_registry.academic_history_updated")
  );
  assert.ok(
    auditEvents.some((event) => event.actionCode === "student_registry.academic_history_deleted")
  );
  assert.ok(
    auditEvents.some((event) => event.actionCode === "student_registry.academic_history_cleared")
  );
}

async function academicHistoryImportScopeOptionsGroupSemestersByAcademicYear() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  await service.importAcademicHistoryRows(
    {
      fileName: "scope-options.xlsx",
      academicYearLabel: "2032/2033 Academic Year",
      semesterLabel: "First Semester",
      rows: [
        {
          "Index Number": "ENG/24/001",
          "Full Name": "Akosua Mensah",
          CWA: 74
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  await service.importAcademicHistoryRows(
    {
      fileName: "scope-options-final.xlsx",
      academicYearLabel: "2032/2033 Academic Year",
      semesterLabel: "Final Results",
      rows: [
        {
          "Index Number": "SCI/24/015",
          "Full Name": "Kwame Arthur",
          CWA: 68
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  await service.importAcademicHistoryRows(
    {
      fileName: "scope-options-older.xlsx",
      academicYearLabel: "2031/2032 Academic Year",
      semesterLabel: "Second Semester",
      rows: [
        {
          "Index Number": "BUS/24/111",
          "Full Name": "Esi Boateng",
          CWA: 80
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const scopes = await service.getAcademicHistoryImportScopeOptions();

  assert.deepEqual(scopes, {
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

async function main() {
  await importRollbackRestoresUpdatedAcademicHistoryRecord();
  await updateDeleteAndClearAcademicHistoryRecords();
  await academicHistoryImportScopeOptionsGroupSemestersByAcademicYear();
  console.log("students-service-tests: ok");
}

main().catch((error) => {
  console.error("students-service-tests: failed");
  console.error(error);
  process.exit(1);
});
