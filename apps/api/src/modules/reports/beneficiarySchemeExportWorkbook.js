import { utils, write } from "xlsx";

function safeSheetName(value) {
  return String(value || "Beneficiary Report")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function buildBeneficiarySchemeExportWorkbook({ report, generatedBy }) {
  const workbook = utils.book_new();
  workbook.Props = {
    Author: "SSFS Scholarship Operations Hub",
    LastAuthor: generatedBy || "System",
    CreatedDate: new Date()
  };

  const summaryRows = [
    ["Scheme", report.schemeName || ""],
    ["Academic Year", report.academicYearLabel || ""],
    ["Total Beneficiaries", report.totalBeneficiaries || 0],
    ["Amount Paid", report.totalAmountPaidLabel || "GHS 0"],
    ["Colleges Represented", report.collegesRepresentedCount || 0],
    ["Current Beneficiaries", report.cohortCounts?.current || 0],
    ["New Beneficiaries", report.cohortCounts?.new || 0],
    ["Not Tagged", report.cohortCounts?.untagged || 0],
    ["Carried Forward", report.cohortCounts?.carriedForward || 0]
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(summaryRows),
    safeSheetName("Scheme Summary")
  );

  const collegeRows = [
    [
      "College",
      "Beneficiaries",
      "Amount Paid",
      "Current Beneficiaries",
      "New Beneficiaries",
      "Not Tagged",
      "Carried Forward"
    ],
    ...(report.collegeBreakdown || []).map((item) => [
      item.college || "Not tagged",
      item.beneficiaryCount || 0,
      item.amountPaidLabel || "GHS 0",
      item.cohortCounts?.current || 0,
      item.cohortCounts?.new || 0,
      item.cohortCounts?.untagged || 0,
      item.cohortCounts?.carriedForward || 0
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(collegeRows),
    safeSheetName("College Breakdown")
  );

  const recordsRows = [
    [
      "Full Name",
      "Student ID / Reference Number",
      "Index Number",
      "College",
      "Amount Paid",
      "Currency",
      "Support Type",
      "Beneficiary Cohort",
      "Carried Forward",
      "Linked Application ID",
      "Linked Recommendation Entry ID",
      "Remarks"
    ],
    ...(report.items || []).map((item) => [
      item.fullName || "",
      item.studentReferenceId || "",
      item.indexNumber || "",
      item.college || "",
      Number(item.amountPaid || 0),
      item.currency || "GHS",
      item.supportType || "unknown",
      item.beneficiaryCohortLabel || "Not tagged",
      item.carriedForwardFromPriorYear ? "Yes" : "No",
      item.linkedApplicationId || "",
      item.linkedWaitlistEntryId || "",
      item.remarks || ""
    ])
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(recordsRows),
    safeSheetName("Beneficiary Records")
  );

  const fileName = [
    "beneficiary-report",
    slugify(report.schemeName) || "scheme",
    slugify(report.academicYearLabel) || "academic-year"
  ]
    .filter(Boolean)
    .join("-")
    .concat(".xlsx");

  const buffer = write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    buffer: Buffer.from(buffer),
    fileName
  };
}
