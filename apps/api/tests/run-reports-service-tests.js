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

function createRepositoriesWithActiveBeneficiaryYear(activeAcademicYearLabel) {
  const repositories = createRepositories();
  repositories.schemes = {
    async list() {
      return [
        {
          id: "scheme-1",
          name: "SRC KBN",
          academicYearLabel: activeAcademicYearLabel,
          status: "active"
        }
      ];
    }
  };
  repositories.cycles = {
    async list() {
      return [
        {
          id: "cycle-1",
          label: activeAcademicYearLabel,
          academicYearLabel: activeAcademicYearLabel,
          status: "active"
        }
      ];
    }
  };
  return repositories;
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

async function dashboardFallsBackToLatestImportedBeneficiaryYearWhenActiveYearIsEmpty() {
  const repositories = createRepositoriesWithActiveBeneficiaryYear("2028/2029 Academic Year");
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
        fullName: "Fallback Student",
        studentReferenceId: "20260004",
        college: "Engineering",
        amountPaid: 3000,
        beneficiaryCohort: "current",
        supportType: "internal"
      },
      {
        academicYearLabel: "2025/2026 Academic Year",
        schemeName: "SRC KBN",
        sponsorName: "SRC",
        fullName: "Older Student",
        studentReferenceId: "20250002",
        college: "Science",
        amountPaid: 1200,
        beneficiaryCohort: "new",
        supportType: "external"
      }
    ],
    importMode: "historical_archive",
    sourceFileName: "dashboard-fallback.xlsx",
    actor: { userId: "user-admin" }
  });

  const result = await service.getDashboard();

  assert.equal(result.beneficiarySupport.currentYearLabel, "2026/2027 Academic Year");
  assert.equal(result.beneficiarySupport.currentYear.totalBeneficiaries, 1);
  assert.equal(result.beneficiarySupport.currentYear.totalAmountPaidLabel, "GHS 3,000");
  assert.equal(result.beneficiarySupport.previousYears.length, 1);
  assert.equal(result.beneficiarySupport.previousYears[0].label, "2025/2026 Academic Year");
}

async function dashboardReviewerLeaderboardFiltersBySchemeAndAcademicYear() {
  const repositories = createRepositories();
  repositories.schemes = {
    async list() {
      return [
        {
          id: "scheme-1",
          name: "SRC KBN",
          academicYearLabel: "2026/2027 Academic Year",
          status: "active"
        },
        {
          id: "scheme-2",
          name: "GNPC Scholarship",
          academicYearLabel: "2025/2026 Academic Year",
          status: "active"
        }
      ];
    }
  };

  const leaderboardQueries = [];
  const service = createReportService({
    repositories,
    database: {
      enabled: true,
      async query(sql, params = []) {
        if (sql.includes("FROM applications a") && sql.includes("GROUP BY 1, 2")) {
          leaderboardQueries.push({ sql, params });
          return {
            rows: params.includes("scheme-2") && params.includes("2025/2026 Academic Year")
              ? [
                  {
                    reviewer_id: "reviewer-2",
                    reviewer_name: "Filtered Reviewer",
                    decision_count: 2,
                    qualified_count: 1,
                    pending_count: 0,
                    disqualified_count: 1,
                    last_decision_at: "2026-05-01T00:00:00.000Z"
                  }
                ]
              : [
                  {
                    reviewer_id: "reviewer-1",
                    reviewer_name: "All Reviewers",
                    decision_count: 10,
                    qualified_count: 8,
                    pending_count: 1,
                    disqualified_count: 1,
                    last_decision_at: "2026-05-02T00:00:00.000Z"
                  }
                ]
          };
        }

        return { rows: [{ count: 0 }] };
      }
    },
    config: { auth: { devTokens: [] } }
  });

  const result = await service.getDashboard({
    reviewerSchemeId: "scheme-2",
    reviewerAcademicYearLabel: "2025/2026 Academic Year"
  });

  assert.equal(result.reviewerLeaderboard.length, 1);
  assert.equal(result.reviewerLeaderboard[0].reviewerName, "Filtered Reviewer");
  assert.equal(result.reviewerLeaderboard[0].decisionCount, 2);
  assert.deepEqual(result.reviewerLeaderboardFilters, {
    schemeId: "scheme-2",
    academicYearLabel: "2025/2026 Academic Year"
  });
  assert.equal(leaderboardQueries.length, 1);
  assert.match(leaderboardQueries[0].sql, /a\.scheme_id::text = \$1/u);
  assert.match(leaderboardQueries[0].sql, /cycle\.academic_year_label = \$2/u);
  assert.deepEqual(leaderboardQueries[0].params, ["scheme-2", "2025/2026 Academic Year"]);
}

async function main() {
  await beneficiarySummaryReportIncludesComparisonsAndAmounts();
  await beneficiarySummaryExportBuildsWorkbook();
  await dashboardFallsBackToLatestImportedBeneficiaryYearWhenActiveYearIsEmpty();
  await dashboardReviewerLeaderboardFiltersBySchemeAndAcademicYear();
  console.log("reports-service-tests: ok");
}

main().catch((error) => {
  console.error("reports-service-tests: failed");
  console.error(error);
  process.exit(1);
});
