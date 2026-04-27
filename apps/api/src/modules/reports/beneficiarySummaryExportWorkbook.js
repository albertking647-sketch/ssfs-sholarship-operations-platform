import { utils, write } from "xlsx";

function safeSheetName(value) {
  return String(value || "Beneficiary Summary")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
}

export async function buildBeneficiarySummaryExportWorkbook({ report, generatedBy }) {
  const workbook = utils.book_new();
  workbook.Props = {
    Author: "SSFS Scholarship Operations Hub",
    LastAuthor: generatedBy || "System",
    CreatedDate: new Date()
  };

  const summaryRows = [
    ["Current Year", report.summary?.currentYearLabel || ""],
    ["Total Beneficiaries", report.summary?.currentYear?.totalBeneficiaries || 0],
    ["Total Amount Paid", report.summary?.currentYear?.totalAmountPaidLabel || "GHS 0"],
    ...(report.summary?.currentYear?.currencyTotals || []).map((item) => [
      `Currency: ${item.currency || ""}`,
      item.amountLabel || ""
    ]),
    ["Imported Lists", report.summary?.currentYear?.importedListsCount || 0],
    ["Current Cohort", report.summary?.currentYear?.cohortCounts?.current || 0],
    ["New Cohort", report.summary?.currentYear?.cohortCounts?.new || 0],
    ["Not Tagged", report.summary?.currentYear?.cohortCounts?.untagged || 0],
    ["Carried Forward", report.summary?.currentYear?.cohortCounts?.carriedForward || 0]
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(summaryRows),
    safeSheetName("Support Summary")
  );

  const comparisonRows = [
    [
      "Academic Year",
      "Beneficiaries",
      "Amount Paid",
      "Imported Lists",
      "Current",
      "New",
      "Not Tagged",
      "Carried Forward"
    ],
    ...(report.summary?.yearComparison || []).map((item) => [
      item.label || "",
      item.totalBeneficiaries || 0,
      item.totalAmountPaidLabel || "GHS 0",
      item.importedListsCount || 0,
      item.cohortCounts?.current || 0,
      item.cohortCounts?.new || 0,
      item.cohortCounts?.untagged || 0,
      item.cohortCounts?.carriedForward || 0
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(comparisonRows),
    safeSheetName("Year Comparison")
  );

  const schemeRows = [
    ["Support / Scheme", "Beneficiaries", "Amount Paid"],
    ...(report.summary?.currentYearSchemeBreakdown || []).map((item) => [
      item.label || "",
      item.value || 0,
      item.amountPaidLabel || "GHS 0"
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(schemeRows),
    safeSheetName("Scheme Breakdown")
  );

  const collegeRows = [
    ["College", "Beneficiaries", "Amount Paid"],
    ...(report.summary?.currentYearCollegeBreakdown || []).map((item) => [
      item.label || "",
      item.value || 0,
      item.amountPaidLabel || "GHS 0"
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(collegeRows),
    safeSheetName("College Breakdown")
  );

  const foodBankSummaryRows = [
    ["Current Year", report.foodBankSupport?.currentYearLabel || report.summary?.currentYearLabel || ""],
    ["Total Registered", report.foodBankSupport?.currentYear?.totalRegistered || 0],
    ["Total Served", report.foodBankSupport?.currentYear?.totalServed || 0],
    ["Colleges Represented", report.foodBankSupport?.currentYear?.collegesRepresentedCount || 0],
    ["Food Support", report.foodBankSupport?.currentYear?.supportTypeCounts?.foodSupport || 0],
    ["Clothing Support", report.foodBankSupport?.currentYear?.supportTypeCounts?.clothingSupport || 0],
    ["Both Food & Clothing", report.foodBankSupport?.currentYear?.supportTypeCounts?.both || 0]
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(foodBankSummaryRows),
    safeSheetName("Food & Clothing Summary")
  );

  const foodBankCollegeRows = [
    ["College", "Registered", "Served"],
    ...(report.foodBankSupport?.currentYear?.collegeBreakdown || []).map((item) => [
      item.college || "",
      item.registeredCount || 0,
      item.servedCount || 0
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(foodBankCollegeRows),
    safeSheetName("Food & Clothing Colleges")
  );

  const allFoodBankYears = [
    {
      label: report.foodBankSupport?.currentYearLabel || "",
      totalRegistered: report.foodBankSupport?.currentYear?.totalRegistered || 0,
      totalServed: report.foodBankSupport?.currentYear?.totalServed || 0,
      collegesRepresentedCount: report.foodBankSupport?.currentYear?.collegesRepresentedCount || 0,
      supportTypeCounts: report.foodBankSupport?.currentYear?.supportTypeCounts || {}
    },
    ...(report.foodBankSupport?.previousYears || [])
  ].filter((item) => item.label);

  const foodBankYearRows = [
    [
      "Academic Year",
      "Registered",
      "Served",
      "Colleges Represented",
      "Food Support",
      "Clothing Support",
      "Both"
    ],
    ...allFoodBankYears.map((item) => [
      item.label || "",
      item.totalRegistered || 0,
      item.totalServed || 0,
      item.collegesRepresentedCount || 0,
      item.supportTypeCounts?.foodSupport || 0,
      item.supportTypeCounts?.clothingSupport || 0,
      item.supportTypeCounts?.both || 0
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(foodBankYearRows),
    safeSheetName("Food & Clothing Years")
  );

  const buffer = write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    buffer: Buffer.from(buffer),
    fileName: "beneficiary-summary-report.xlsx"
  };
}
