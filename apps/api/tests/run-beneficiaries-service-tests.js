import assert from "node:assert/strict";

import { createBeneficiaryRepository } from "../src/modules/beneficiaries/repository.js";
import { createBeneficiaryService } from "../src/modules/beneficiaries/service.js";

function createSampleBeneficiaryRepository() {
  return createBeneficiaryRepository({
    database: {
      enabled: false
    }
  });
}

function createRepositories(overrides = {}) {
  return {
    beneficiaries: createSampleBeneficiaryRepository(),
    schemes: {
      async list() {
        return [
          {
            id: "scheme-1",
            name: "SRC KBN",
            academicYearLabel: "2026/2027 Academic Year",
            status: "active"
          }
        ];
      }
    },
    cycles: {
      async list() {
        return [
          {
            id: "cycle-1",
            label: "2026/2027 Academic Year",
            academicYearLabel: "2026/2027 Academic Year",
            status: "active"
          }
        ];
      }
    },
    waitlist: {
      async list() {
        return [];
      }
    },
    ...overrides
  };
}

async function beneficiaryDashboardIncludesCohortCounts() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        fullName: "Student Current",
        studentReferenceId: "20260001",
        amountPaid: 1200,
        beneficiaryCohort: "current",
        supportType: "internal"
      },
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        fullName: "Student New",
        studentReferenceId: "20260002",
        amountPaid: 1400,
        beneficiaryCohort: "new",
        supportType: "internal"
      },
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        fullName: "Student Untagged",
        studentReferenceId: "20260003",
        amountPaid: 1000,
        beneficiaryCohort: null,
        supportType: "external"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "beneficiaries.xlsx",
    actor: { userId: "user-admin" }
  });

  const dashboard = await service.getDashboard();

  assert.deepEqual(dashboard.currentYear.cohortCounts, {
    current: 1,
    new: 1,
    untagged: 1,
    carriedForward: 0
  });
  assert.deepEqual(dashboard.currentYear.currencyTotals, [
    {
      currency: "GHS",
      amount: 3600,
      amountLabel: "GHS 3,600"
    }
  ]);
}

async function previewUsesSelectedDefaultCurrencyWhenRowsDoNotIncludeOne() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  const preview = await service.previewImport({
    importMode: "historical_archive",
    duplicateStrategy: "skip",
    defaultCurrency: "USD",
    rows: [
      {
        "Academic Year": "2026/2027",
        "Scholarship Name or Support Name": "USD Support",
        "Full Name": "Dollar Student",
        "Student ID / Reference Number": "20269991",
        "Amount Paid": "2500",
        "Support Type": "External"
      }
    ]
  });

  assert.equal(preview.rows[0].payload.currency, "USD");
}

async function currentCycleImportLinksPromotedWaitlistEntries() {
  const repositories = createRepositories({
    waitlist: {
      async list(filters = {}) {
        assert.equal(filters.status, "promoted");
        return [
          {
            id: "waitlist-42",
            applicationId: "application-42",
            studentReferenceId: "20261234",
            indexNumber: "ENG/24/001",
            schemeName: "SRC KBN",
            cycleLabel: "2026/2027 Academic Year",
            status: "promoted"
          }
        ];
      }
    }
  });
  const service = createBeneficiaryService({ repositories });

  const result = await service.importRows(
    {
      importMode: "current_cycle_linked",
      categorizedByCollege: false,
      beneficiaryCohort: "",
      allowDuplicates: false,
      fileName: "current-beneficiaries.xlsx",
      rows: [
        {
          "Academic Year": "2026/2027",
          "Scholarship Name or Support Name": "SRC KBN",
          "Full Name": "Linked Student",
          "Student ID / Reference Number": "20261234",
          "Amount Paid": "1500",
          "Support Type": "Internal"
        }
      ]
    },
    { userId: "user-admin" }
  );

  assert.equal(result.summary.importedRows, 1);
  assert.deepEqual(result.summary.cohortTotals, {
    current: 0,
    new: 0,
    untagged: 1,
    carriedForward: 0
  });
  assert.equal(result.items[0].linkedWaitlistEntryId, "waitlist-42");
  assert.equal(result.items[0].linkedApplicationId, "application-42");
}

async function previewDetectsCrossSchemeDuplicateStudentIds() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2025/2026 Academic Year",
        schemeName: "Old Support",
        fullName: "Existing Student",
        studentReferenceId: "20261111",
        amountPaid: 900,
        beneficiaryCohort: "current",
        supportType: "internal"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "existing.xlsx",
    actor: { userId: "user-admin" }
  });

  const preview = await service.previewImport({
    importMode: "historical_archive",
    duplicateStrategy: "skip",
    rows: [
      {
        "Academic Year": "2026/2027",
        "Scholarship Name or Support Name": "New Support",
        "Full Name": "Existing Student",
        "Student ID / Reference Number": "20261111",
        "Amount Paid": "1200",
        "Support Type": "Internal"
      }
    ]
  });

  assert.equal(preview.summary.crossScopeDuplicateRows, 1);
  assert.equal(preview.rows[0].status, "valid");
  assert.match(preview.rows[0].warnings.join(" "), /other support records/i);
}

async function replaceExistingStrategyReplacesSameSchemeYearStudent() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        fullName: "Original Student",
        studentReferenceId: "20262222",
        amountPaid: 1000,
        beneficiaryCohort: "current",
        supportType: "internal"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "original.xlsx",
    actor: { userId: "user-admin" }
  });

  const result = await service.importRows(
    {
      importMode: "historical_archive",
      duplicateStrategy: "replace_existing",
      rows: [
        {
          "Academic Year": "2026/2027",
          "Scholarship Name or Support Name": "SRC KBN",
          "Full Name": "Replacement Student",
          "Student ID / Reference Number": "20262222",
          "Amount Paid": "1800",
          "Support Type": "External"
        }
      ]
    },
    { userId: "user-admin" }
  );

  const list = await service.list({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });

  assert.equal(result.summary.replacedRows, 1);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].fullName, "Replacement Student");
  assert.equal(list.items[0].amountPaid, 1800);
  assert.equal(list.items[0].supportType, "external");
}

async function rowUpdateDeleteAndHistoryRollbackWork() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  const firstImport = await service.importRows(
    {
      importMode: "historical_archive",
      duplicateStrategy: "skip",
      fileName: "batch-a.xlsx",
      rows: [
        {
          "Academic Year": "2026/2027",
          "Scholarship Name or Support Name": "SRC KBN",
          "Full Name": "History Student",
          "Student ID / Reference Number": "20263333",
          "Amount Paid": "1500",
          "Support Type": "Internal"
        }
      ]
    },
    { userId: "user-admin" }
  );

  const recordId = firstImport.items[0].id;
  const updated = await service.updateRecord(
    recordId,
    {
      fullName: "Updated History Student",
      amountPaid: 1750,
      supportType: "external",
      college: "Engineering",
      remarks: "Updated",
      reason: "Corrected imported beneficiary details"
    },
    { userId: "user-admin" }
  );

  assert.equal(updated.fullName, "Updated History Student");
  assert.equal(updated.amountPaid, 1750);
  assert.equal(updated.supportType, "external");

  const recordHistory = await service.getRecordHistory(recordId);
  assert.equal(recordHistory.record.id, recordId);
  assert.ok(recordHistory.items.some((item) => item.eventType === "imported"));
  assert.ok(
    recordHistory.items.some(
      (item) =>
        item.eventType === "updated" &&
        item.reason === "Corrected imported beneficiary details"
    )
  );

  const secondImport = await service.importRows(
    {
      importMode: "historical_archive",
      duplicateStrategy: "skip",
      fileName: "batch-b.xlsx",
      rows: [
        {
          "Academic Year": "2026/2027",
          "Scholarship Name or Support Name": "SRC KBN",
          "Full Name": "Rollback Student",
          "Student ID / Reference Number": "20264444",
          "Amount Paid": "1300",
          "Support Type": "Internal"
        }
      ]
    },
    { userId: "user-admin" }
  );

  const history = await service.getImportHistory({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });

  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].fileName, "batch-b.xlsx");

  const rollback = await service.rollbackBatch(
    {
      batchReference: secondImport.batchReference,
      reason: "Imported the wrong file"
    },
    { userId: "user-admin" }
  );

  assert.equal(rollback.deletedRows, 1);

  const historyAfterRollback = await service.getImportHistory({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });
  const rolledBackBatch = historyAfterRollback.items.find(
    (item) => item.batchReference === secondImport.batchReference
  );
  assert.equal(rolledBackBatch?.status, "rolled_back");
  assert.equal(rolledBackBatch?.rollbackReason, "Imported the wrong file");

  const auditFeed = await service.getAuditFeed({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });
  assert.ok(auditFeed.items.some((item) => item.eventType === "updated"));
  assert.ok(
    auditFeed.items.some(
      (item) => item.eventType === "rolled_back" && item.reason === "Imported the wrong file"
    )
  );

  await service.deleteRecord(
    recordId,
    {
      reason: "Incorrect beneficiary record"
    },
    { userId: "user-admin" }
  );
  const remaining = await service.list({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });
  assert.equal(remaining.total, 0);
}

async function rowLevelDuplicateOverridesCanReplaceSelectedRows() {
  const repositories = createRepositories();
  const service = createBeneficiaryService({ repositories });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        fullName: "Original Duplicate Student",
        studentReferenceId: "20265555",
        amountPaid: 1000,
        beneficiaryCohort: "current",
        supportType: "internal"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "original-duplicates.xlsx",
    actor: { userId: "user-admin" }
  });

  const result = await service.importRows(
    {
      importMode: "historical_archive",
      duplicateStrategy: "skip",
      duplicateRowActions: {
        1: "replace_existing"
      },
      rows: [
        {
          "Academic Year": "2026/2027",
          "Scholarship Name or Support Name": "SRC KBN",
          "Full Name": "Selected Replacement",
          "Student ID / Reference Number": "20265555",
          "Amount Paid": "2100",
          "Support Type": "External"
        }
      ]
    },
    { userId: "user-admin" }
  );

  const list = await service.list({
    academicYearLabel: "2026/2027 Academic Year",
    schemeName: "SRC KBN"
  });

  assert.equal(result.summary.replacedRows, 1);
  assert.equal(result.summary.importedRows, 1);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].fullName, "Selected Replacement");
  assert.equal(list.items[0].amountPaid, 2100);
}

async function main() {
  await beneficiaryDashboardIncludesCohortCounts();
  await previewUsesSelectedDefaultCurrencyWhenRowsDoNotIncludeOne();
  await currentCycleImportLinksPromotedWaitlistEntries();
  await previewDetectsCrossSchemeDuplicateStudentIds();
  await replaceExistingStrategyReplacesSameSchemeYearStudent();
  await rowUpdateDeleteAndHistoryRollbackWork();
  await rowLevelDuplicateOverridesCanReplaceSelectedRows();
  console.log("beneficiaries-service-tests: ok");
}

main().catch((error) => {
  console.error("beneficiaries-service-tests: failed");
  console.error(error);
  process.exit(1);
});
