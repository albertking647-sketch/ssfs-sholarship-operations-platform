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
          "Index Number": "8637723",
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
          "Index Number": "8637723",
          "Full Name": "Akosua Mensah",
          "Academic Year": "2032/2033 Academic Year",
          "Semester Label": "First Semester",
          CWA: 75
        },
        {
          "Index Number": "PG8637723",
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
          "Index Number": "8637723",
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
          "Index Number": "PG8637723",
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
          "Index Number": "8637724",
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

async function academicHistoryScopeOptionsIncludeExistingHistoryRowsWithoutImportBatches() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    academicYearLabel: "2024/2025 Academic Year",
    semesterLabel: "Second Semester",
    cwa: 76
  });

  const scopes = await service.getAcademicHistoryImportScopeOptions();

  assert.ok(
    scopes.items.some(
      (item) =>
        item.academicYearLabel === "2024/2025 Academic Year" &&
        item.semesters.includes("Second Semester")
    )
  );

  const clearResult = await service.clearAcademicHistoryScope(
    {
      academicYearLabel: "2024/2025 Academic Year",
      semesterLabel: "Second Semester",
      reason: "Reset imported 2024/2025 second semester records"
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(clearResult.summary.deletedRows, 1);
}

async function academicHistoryListFiltersByAcademicYearAndSemester() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    academicYearLabel: "2040/2041",
    semesterLabel: "Second Semester",
    cwa: 76
  });
  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-002",
    academicYearLabel: "2040/2041",
    semesterLabel: "Final Results",
    cwa: 72
  });

  const history = await service.listAcademicHistory({
    academicYearLabel: "2040/2041",
    semesterLabel: "Second Semester",
    includeProfiles: "true"
  });
  const importHistory = await service.getAcademicHistoryImportHistory({
    academicYearLabel: "2040/2041",
    semesterLabel: "Second Semester"
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].semesterLabel, "Second Semester");
  assert.equal(history[0].cwa, 76);
  assert.equal(importHistory.scopeRecordCount, 1);
}

async function academicHistoryScopeOptionsFallbackToExistingHistoryRowsWhenScopeQueryIsEmpty() {
  const service = createStudentService({
    repositories: {
      students: {
        async listAcademicHistoryImportHistory() {
          return { items: [] };
        },
        async listAcademicHistoryScopes() {
          return [];
        },
        async countAcademicHistory() {
          return 1;
        },
        async listAcademicHistory() {
          return [
            {
              academicYearLabel: "2024/2025",
              semesterLabel: "Second Semester"
            }
          ];
        }
      },
      cycles: {
        async list() {
          return [];
        }
      },
      audit: {
        async record() {}
      }
    }
  });

  const scopes = await service.getAcademicHistoryImportScopeOptions();

  assert.deepEqual(scopes, {
    totalAcademicYears: 1,
    items: [
      {
        academicYearLabel: "2024/2025",
        semesters: ["Second Semester"]
      }
    ]
  });
}

async function secondSemesterRanksAsLatestAcademicHistoryWithinSameYear() {
  const { repositories } = createRepositories();

  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    academicYearLabel: "2035/2036 Academic Year",
    semesterLabel: "Final Results",
    cwa: 91
  });
  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    academicYearLabel: "2035/2036 Academic Year",
    semesterLabel: "First Semester",
    cwa: 71
  });
  await repositories.students.upsertAcademicHistoryEntry({
    studentId: "student-001",
    academicYearLabel: "2035/2036 Academic Year",
    semesterLabel: "Second Semester",
    cwa: 82
  });

  const history = await repositories.students.listAcademicHistory({ studentId: "student-001" });

  assert.equal(history[0].semesterLabel, "Second Semester");
  assert.equal(history[0].cwa, 82);
}

async function academicHistoryImportMatchesByReferenceIdAndIndexNumber() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  const preview = await service.previewAcademicHistoryImport({
    fileName: "sis-cwa.xlsx",
    academicYearLabel: "2033/2034 Academic Year",
    semesterLabel: "Final Results",
    rows: [
      {
        "Reference Number": "20261234",
        "Full Name": "Akosua Mensah",
        CWA: 81
      },
      {
        "Index Number": "PG8637723",
        "Full Name": "Kwame Arthur",
        CWA: 72
      },
      {
        "Reference Number": "20269991",
        "Index Number": "8637724",
        "Full Name": "Esi Boateng",
        CWA: 79
      }
    ]
  });

  assert.equal(preview.summary.validRows, 3);
  assert.equal(preview.summary.invalidRows, 0);
  assert.equal(preview.rows[0].matchedStudent.studentReferenceId, "20261234");
  assert.equal(preview.rows[1].matchedStudent.indexNumber, "PG8637723");
  assert.equal(preview.rows[2].matchedStudent.id, "student-003");
}

async function academicHistoryImportRejectsConflictingReferenceAndIndexMatches() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  const preview = await service.previewAcademicHistoryImport({
    fileName: "sis-cwa-conflict.xlsx",
    academicYearLabel: "2033/2034 Academic Year",
    semesterLabel: "Final Results",
    rows: [
      {
        "Reference Number": "20261234",
        "Index Number": "PG8637723",
        "Full Name": "Akosua Mensah",
        CWA: 81
      }
    ]
  });

  assert.equal(preview.summary.validRows, 0);
  assert.equal(preview.summary.invalidRows, 1);
  assert.match(preview.rows[0].issues.join(" "), /different registry students/i);
}

async function academicHistoryImportCleansPollutedSisProgrammeValues() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  const preview = await service.previewAcademicHistoryImport({
    fileName: "sis-cwa-polluted-programme.xlsx",
    academicYearLabel: "2033/2034 Academic Year",
    semesterLabel: "Second Semester",
    rows: [
      {
        "Reference Number": "20261234",
        "Index Number": "8637723",
        "Full Name": "Akosua Mensah",
        "Programme of Study":
          "21793713 9921725 MUSAH, Hafiza (Miss) F BSC. AGRIBUSINESS MANAGEMENT 76.00",
        CWA: 81
      }
    ]
  });

  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.rows[0].payload.program, "BSC. AGRIBUSINESS MANAGEMENT");
}

async function academicHistoryPreviewReturnsReusableRowsForImport() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  const preview = await service.previewAcademicHistoryImport({
    fileName: "reuse-cwa-preview.xlsx",
    academicYearLabel: "2034/2035 Academic Year",
    semesterLabel: "Second Semester",
    rows: [
      {
        "Reference Number": "20261234",
        "Index Number": "8637723",
        "Full Name": "Akosua Mensah",
        CWA: 82
      },
      {
        "Reference Number": "20264321",
        "Index Number": "PG8637723",
        "Full Name": "Kwame Arthur",
        CWA: 74
      }
    ]
  });

  assert.equal(preview.importRows.length, 2);
  assert.deepEqual(preview.importRows[0], {
    studentReferenceId: "20261234",
    indexNumber: "8637723",
    fullName: "Akosua Mensah",
    academicYearLabel: "2034/2035 Academic Year",
    semesterLabel: "Second Semester",
    cwa: 82,
    college: null,
    program: null,
    year: null,
    notes: null
  });
}

async function academicHistoryImportUsesBulkUpsertWithoutLiveProgress() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });
  const originalBulkUpsert = repositories.students.upsertAcademicHistoryEntries?.bind(
    repositories.students
  );
  const bulkCalls = [];

  repositories.students.upsertAcademicHistoryEntries = async (inputs) => {
    bulkCalls.push(inputs);
    return originalBulkUpsert(inputs);
  };

  const imported = await service.importAcademicHistoryRows(
    {
      fileName: "bulk-cwa.xlsx",
      academicYearLabel: "2034/2035 Academic Year",
      semesterLabel: "Second Semester",
      rows: [
        {
          "Reference Number": "20261234",
          "Index Number": "8637723",
          "Full Name": "Akosua Mensah",
          CWA: 82
        },
        {
          "Reference Number": "20264321",
          "Index Number": "PG8637723",
          "Full Name": "Kwame Arthur",
          CWA: 74
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  assert.equal(imported.summary.importedRows, 2);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, 2);
}

async function academicHistoryImportUsesFastBulkUpsertWithLiveProgress() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });
  const originalBulkUpsert = repositories.students.upsertAcademicHistoryEntries?.bind(
    repositories.students
  );
  const bulkCalls = [];
  const progressEvents = [];

  repositories.students.upsertAcademicHistoryEntries = async (inputs) => {
    bulkCalls.push(inputs);
    return originalBulkUpsert(inputs);
  };

  const imported = await service.importAcademicHistoryRows(
    {
      fileName: "fast-progress-cwa.xlsx",
      academicYearLabel: "2035/2036 Academic Year",
      semesterLabel: "Second Semester",
      rows: [
        {
          "Reference Number": "20261234",
          "Index Number": "8637723",
          "Full Name": "Akosua Mensah",
          CWA: 82
        },
        {
          "Reference Number": "20264321",
          "Index Number": "PG8637723",
          "Full Name": "Kwame Arthur",
          CWA: 74
        },
        {
          "Reference Number": "20269991",
          "Index Number": "8637724",
          "Full Name": "Esi Boateng",
          CWA: 79
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" },
    (event) => progressEvents.push(event)
  );

  const importingProgress = progressEvents.filter(
    (event) => event.phase === "importing" && event.totalRows === 3
  );

  assert.equal(imported.summary.importedRows, 3);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, 3);
  assert.ok(
    importingProgress.some((event) => event.processedRows > 0),
    "Expected live CWA import progress to move before completion."
  );
  assert.ok(
    !importingProgress.some((event) => event.processedRows === 1),
    "Expected live CWA imports to avoid one-row-at-a-time database writes."
  );
  assert.equal(importingProgress.at(-1).processedRows, 3);
  assert.equal(importingProgress.at(-1).percent, 100);
}

async function largeAcademicHistoryBulkImportReportsIntermediateProgress() {
  const totalRows = 12005;
  const rows = Array.from({ length: totalRows }, (_, index) => ({
    "Index Number": `IDX-${String(index + 1).padStart(5, "0")}`,
    "Full Name": `Bulk Student ${index + 1}`,
    CWA: 70 + (index % 20) / 10
  }));
  const registryByIndexNumber = new Map(
    rows.map((row, index) => [
      row["Index Number"],
      {
        id: `student-${index + 1}`,
        fullName: row["Full Name"],
        studentReferenceId: `REF-${String(index + 1).padStart(5, "0")}`,
        indexNumber: row["Index Number"],
        college: "College of Science",
        program: "BSC. BULK IMPORT",
        year: "Year 2",
        wassceAggregate: null
      }
    ])
  );
  const bulkCalls = [];
  const progressEvents = [];
  const service = createStudentService({
    repositories: {
      students: {
        async findExistingByIdentifierBatch({ indexNumbers = [] } = {}) {
          const byIndexNumber = new Map();
          for (const indexNumber of indexNumbers) {
            const match = registryByIndexNumber.get(indexNumber);
            if (match) {
              byIndexNumber.set(indexNumber, [match]);
            }
          }

          return {
            byReferenceId: new Map(),
            byIndexNumber
          };
        },
        async countAcademicHistory() {
          return 0;
        },
        async upsertAcademicHistoryEntries(inputs = []) {
          bulkCalls.push(inputs);
          return inputs.map((input, index) => ({
            item: {
              id: `history-${bulkCalls.length}-${index + 1}`,
              studentId: input.studentId,
              academicYearLabel: input.academicYearLabel,
              semesterLabel: input.semesterLabel,
              program: input.program,
              cwa: input.cwa
            },
            previousRecord: null,
            actionType: "created"
          }));
        },
        async saveAcademicHistoryImportBatch() {}
      },
      cycles: {
        async list() {
          return [];
        }
      },
      audit: {
        async record() {}
      }
    }
  });

  const imported = await service.importAcademicHistoryRows(
    {
      fileName: "large-bulk-cwa.xlsx",
      academicYearLabel: "2037/2038 Academic Year",
      semesterLabel: "Second Semester",
      rows
    },
    { userId: "user-admin", fullName: "Platform Admin" },
    (event) => progressEvents.push(event)
  );

  const intermediateEvent = progressEvents.find(
    (event) =>
      event.phase === "importing" &&
      event.processedRows > 0 &&
      event.processedRows < event.totalRows &&
      event.percent > 0 &&
      event.percent < 100
  );

  assert.equal(imported.summary.importedRows, totalRows);
  assert.deepEqual(
    bulkCalls.map((inputs) => inputs.length),
    [5000, 5000, 2005]
  );
  assert.ok(intermediateEvent, "Expected a partial CWA import progress event before completion.");
}

async function academicHistoryBulkImportDoesNotCreateDuplicateRecordsForRepeatedRows() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });
  const originalBulkUpsert = repositories.students.upsertAcademicHistoryEntries?.bind(
    repositories.students
  );
  const bulkCalls = [];

  repositories.students.upsertAcademicHistoryEntries = async (inputs) => {
    bulkCalls.push(inputs);
    return originalBulkUpsert(inputs);
  };

  const imported = await service.importAcademicHistoryRows(
    {
      fileName: "duplicate-cwa.xlsx",
      academicYearLabel: "2036/2037 Academic Year",
      semesterLabel: "Second Semester",
      rows: [
        {
          "Reference Number": "20261234",
          "Index Number": "8637723",
          "Full Name": "Akosua Mensah",
          "Programme of Study": "BSC. COMPUTER ENGINEERING",
          CWA: 80
        },
        {
          "Reference Number": "20261234",
          "Index Number": "8637723",
          "Full Name": "Akosua Mensah",
          "Programme of Study": "BSC. COMPUTER ENGINEERING",
          CWA: 82
        }
      ]
    },
    { userId: "user-admin", fullName: "Platform Admin" }
  );

  const history = (
    await repositories.students.listAcademicHistory({
      studentId: "student-001",
      academicYearLabel: "2036/2037 Academic Year",
      semesterLabel: "Second Semester"
    })
  ).filter((item) => item.program === "BSC. COMPUTER ENGINEERING");

  assert.equal(imported.summary.importedRows, 2);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].cwa, 82);
}

async function registrySearchMatchesNameWordsInAnyOrder() {
  const { repositories } = createRepositories();
  const service = createStudentService({ repositories });

  const directOrder = await service.search({ q: "Akosua Mensah" });
  const reverseOrder = await service.search({ q: "Mensah Akosua" });

  assert.ok(
    directOrder.some((item) => item.studentReferenceId === "20261234"),
    "Expected direct-name search to find the registry student."
  );
  assert.ok(
    reverseOrder.some((item) => item.studentReferenceId === "20261234"),
    "Expected reordered-name search to find the same registry student."
  );
}

async function main() {
  await importRollbackRestoresUpdatedAcademicHistoryRecord();
  await updateDeleteAndClearAcademicHistoryRecords();
  await academicHistoryImportScopeOptionsGroupSemestersByAcademicYear();
  await academicHistoryScopeOptionsIncludeExistingHistoryRowsWithoutImportBatches();
  await academicHistoryListFiltersByAcademicYearAndSemester();
  await academicHistoryScopeOptionsFallbackToExistingHistoryRowsWhenScopeQueryIsEmpty();
  await secondSemesterRanksAsLatestAcademicHistoryWithinSameYear();
  await academicHistoryImportMatchesByReferenceIdAndIndexNumber();
  await academicHistoryImportRejectsConflictingReferenceAndIndexMatches();
  await academicHistoryImportCleansPollutedSisProgrammeValues();
  await academicHistoryPreviewReturnsReusableRowsForImport();
  await academicHistoryImportUsesBulkUpsertWithoutLiveProgress();
  await academicHistoryImportUsesFastBulkUpsertWithLiveProgress();
  await largeAcademicHistoryBulkImportReportsIntermediateProgress();
  await academicHistoryBulkImportDoesNotCreateDuplicateRecordsForRepeatedRows();
  await registrySearchMatchesNameWordsInAnyOrder();
  console.log("students-service-tests: ok");
}

main().catch((error) => {
  console.error("students-service-tests: failed");
  console.error(error);
  process.exit(1);
});
