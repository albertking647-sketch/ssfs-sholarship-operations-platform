import assert from "node:assert/strict";
import { read } from "xlsx";

import { createBeneficiaryRepository } from "../src/modules/beneficiaries/repository.js";
import { createFoodBankRepository } from "../src/modules/foodBank/repository.js";
import { createReportService } from "../src/modules/reports/service.js";

function createRepositories() {
  return {
    beneficiaries: createBeneficiaryRepository({
      database: {
        enabled: false
      }
    }),
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
    applications: {
      async summary() {
        return {
          totalApplications: 0,
          reviewedCount: 0,
          qualifiedCount: 0,
          pendingCount: 0,
          disqualifiedCount: 0,
          notReviewedCount: 0
        };
      }
    },
    applicationCriteria: {
      async getBySchemeCycle() {
        return null;
      }
    },
    waitlist: {
      async list() {
        return [];
      }
    },
    students: {
      async getById(id) {
        if (String(id) === "student-1") {
          return {
            id: "student-1",
            college: "Engineering"
          };
        }
        return null;
      }
    },
    foodBank: createFoodBankRepository({
      database: {
        enabled: false
      }
    })
  };
}

async function beneficiarySummaryReportIncludesComparisonsAndAmounts() {
  const repositories = createRepositories();
  const service = createReportService({
    repositories,
    database: { enabled: false },
    config: { auth: { devTokens: [] } }
  });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        sponsorName: "SRC",
        fullName: "Current Student",
        studentReferenceId: "20260001",
        college: "Engineering",
        amountPaid: 2000,
        beneficiaryCohort: "current",
        supportType: "internal"
      },
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "Support A",
        sponsorName: "Donor A",
        fullName: "Second Student",
        studentReferenceId: "20260002",
        college: "Science",
        amountPaid: 1500,
        currency: "USD",
        beneficiaryCohort: "new",
        supportType: "external"
      },
      {
        academicYearLabel: "2025/2026 Academic Year",
        schemeName: "SRC KBN",
        sponsorName: "SRC",
        fullName: "Prior Student",
        studentReferenceId: "20250001",
        college: "Engineering",
        amountPaid: 1000,
        beneficiaryCohort: "new",
        supportType: "internal"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "report-summary.xlsx",
    actor: { userId: "user-admin" }
  });

  const result = await service.getBeneficiarySummaryReport();

  assert.equal(result.summary.currentYearLabel, "2026/2027 Academic Year");
  assert.equal(result.summary.yearComparison.length, 2);
  assert.equal(result.summary.currentYear.totalAmountPaidLabel, "GHS 2,000 + USD 1,500");
  assert.deepEqual(result.summary.currentYear.currencyTotals, [
    { currency: "GHS", amount: 2000, amountLabel: "GHS 2,000" },
    { currency: "USD", amount: 1500, amountLabel: "USD 1,500" }
  ]);
  assert.equal(result.summary.currentYearSchemeBreakdown[0].amountPaidLabel, "GHS 2,000");
  assert.equal(result.summary.currentYearCollegeBreakdown[0].amountPaidLabel, "GHS 2,000");
  assert.equal(result.foodBankSupport.currentYear.totalRegistered, 0);
}

async function beneficiarySummaryExportBuildsWorkbook() {
  const repositories = createRepositories();
  const service = createReportService({
    repositories,
    database: { enabled: false },
    config: { auth: { devTokens: [] } }
  });

  await repositories.beneficiaries.importRows({
    items: [
      {
        academicYearLabel: "2026/2027 Academic Year",
        schemeName: "SRC KBN",
        sponsorName: "SRC",
        fullName: "Workbook Student",
        studentReferenceId: "20260003",
        college: "Engineering",
        amountPaid: 2200,
        beneficiaryCohort: "current",
        supportType: "internal"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "summary-export.xlsx",
    actor: { userId: "user-admin" }
  });
  await repositories.foodBank.create(
    {
      studentId: "student-1",
      academicYearLabel: "2026/2027 Academic Year",
      referralSource: "Counselor",
      supportTypes: ["food_support", "clothing_support"]
    },
    { userId: "user-admin" }
  );

  const exportResult = await service.exportBeneficiarySummaryReport({
    fullName: "Admin User",
    userId: "user-admin"
  });

  assert.match(exportResult.fileName, /beneficiary-summary-report/i);
  assert.ok(Buffer.isBuffer(exportResult.buffer));
  assert.ok(exportResult.buffer.length > 0);

  const workbook = read(exportResult.buffer, { type: "buffer" });
  assert.ok(workbook.SheetNames.includes("Food & Clothing Summary"));
  assert.ok(workbook.SheetNames.includes("Food & Clothing Colleges"));
  const summarySheet = workbook.Sheets["Support Summary"];
  assert.equal(summarySheet.A4?.v, "Currency: GHS");
  assert.equal(summarySheet.B4?.v, "GHS 2,200");
  const foodBankSummarySheet = workbook.Sheets["Food & Clothing Summary"];
  assert.equal(foodBankSummarySheet.A5?.v, "Food Support");
  assert.equal(foodBankSummarySheet.B5?.v, 1);
  assert.equal(foodBankSummarySheet.A6?.v, "Clothing Support");
  assert.equal(foodBankSummarySheet.B6?.v, 1);
}

async function main() {
  await beneficiarySummaryReportIncludesComparisonsAndAmounts();
  await beneficiarySummaryExportBuildsWorkbook();
  console.log("reports-service-tests: ok");
}

main().catch((error) => {
  console.error("reports-service-tests: failed");
  console.error(error);
  process.exit(1);
});
