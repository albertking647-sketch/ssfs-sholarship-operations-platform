import { utils, write } from "xlsx";

function formatDecisionLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "not_reviewed") {
    return "Yet to Review";
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function normalizeNumberCell(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? "" : numeric;
}

function safeSheetName(value) {
  return String(value || "Applications Export")
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

function normalizeCollege(value) {
  return String(value || "").trim() || "Unknown / not captured";
}

function normalizeInterviewStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["scheduled", "completed", "waived"].includes(normalized) ? normalized : "pending";
}

function buildExportRows(items) {
  return (items || []).map((item) => ({
    studentReferenceId: item.studentReferenceId || "",
    registryName: item.studentName || "",
    uploadedName: item.uploadedFullName || item.studentName || "",
    uploadedReferenceId: item.uploadedStudentReferenceId || item.studentReferenceId || "",
    indexNumber: item.indexNumber || "",
    phoneNumber: item.phoneNumber || item.studentPhoneNumber || "",
    college: item.college || "",
    program: item.program || item.uploadedProgram || "",
    year: item.year || "",
    cwa: normalizeNumberCell(item.cwa),
    wassceAggregate: normalizeNumberCell(item.wassceAggregate),
    finalScore: normalizeNumberCell(item.finalScore),
    schemeName: item.schemeName || "",
    academicYear: item.cycleLabel || "",
    qualificationStatus: formatDecisionLabel(item.qualificationStatus),
    interviewStatus: formatDecisionLabel(item.interviewStatus || "pending"),
    interviewScore: normalizeNumberCell(item.interviewScore),
    interviewDate: formatDate(item.interviewDate),
    interviewNotes: item.interviewNotes || "",
    reviewReason: item.reviewReason || "",
    reviewComment: item.reviewComment || "",
    screeningDecision: formatDecisionLabel(item.screeningAssessment?.recommendedDecision),
    nameMismatch: item.nameMismatchFlag ? "Yes" : "No",
    submittedAt: formatDate(item.submittedAt),
    reviewUpdatedAt: formatDate(item.reviewUpdatedAt)
  }));
}

function buildCollegeBreakdown(items) {
  const groups = new Map();

  for (const item of items || []) {
    const college = normalizeCollege(item.college);
    const qualificationStatus = String(item.qualificationStatus || "not_reviewed").trim().toLowerCase();
    const interviewStatus = normalizeInterviewStatus(item.interviewStatus);
    const current =
      groups.get(college) ||
      {
        college,
        totalApplications: 0,
        reviewedCount: 0,
        qualifiedCount: 0,
        pendingCount: 0,
        disqualifiedCount: 0,
        notReviewedCount: 0,
        interviewPendingCount: 0,
        interviewScheduledCount: 0,
        interviewCompletedCount: 0,
        interviewWaivedCount: 0
      };

    current.totalApplications += 1;
    if (qualificationStatus !== "not_reviewed") current.reviewedCount += 1;
    if (qualificationStatus === "qualified") current.qualifiedCount += 1;
    if (qualificationStatus === "pending") current.pendingCount += 1;
    if (qualificationStatus === "disqualified") current.disqualifiedCount += 1;
    if (qualificationStatus === "not_reviewed") current.notReviewedCount += 1;
    if (interviewStatus === "pending") current.interviewPendingCount += 1;
    if (interviewStatus === "scheduled") current.interviewScheduledCount += 1;
    if (interviewStatus === "completed") current.interviewCompletedCount += 1;
    if (interviewStatus === "waived") current.interviewWaivedCount += 1;

    groups.set(college, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.totalApplications !== a.totalApplications) {
      return b.totalApplications - a.totalApplications;
    }
    return a.college.localeCompare(b.college);
  });
}

function appendSheet(workbook, name, rows) {
  const worksheet = utils.aoa_to_sheet(rows);
  const columnWidths = rows[0]?.map((_, columnIndex) => ({
    wch: Math.min(
      Math.max(
        ...rows.map((row) => String(row[columnIndex] ?? "").length),
        12
      ) + 2,
      36
    )
  }));
  worksheet["!cols"] = columnWidths;
  utils.book_append_sheet(workbook, worksheet, safeSheetName(name));
}

export async function buildApplicationsExportWorkbook({
  items,
  schemeName,
  academicYearLabel,
  qualificationStatus,
  fontName,
  generatedBy
}) {
  const workbook = utils.book_new();
  workbook.Props = {
    Author: "SSFS Scholarship Operations Hub",
    Company: "SSFS Scholarship Operations Hub",
    LastAuthor: generatedBy || "System",
    CreatedDate: new Date(),
    Subject: `Application export using ${fontName || "default"} workbook font preference`
  };

  const decisionLabel = formatDecisionLabel(qualificationStatus);
  const rows = buildExportRows(items);
  const columns = [
    ["Student Reference ID", "studentReferenceId"],
    ["Registry Name", "registryName"],
    ["Uploaded Name", "uploadedName"],
    ["Uploaded Reference ID", "uploadedReferenceId"],
    ["Index Number", "indexNumber"],
    ["Phone Number", "phoneNumber"],
    ["College", "college"],
    ["Programme", "program"],
    ["Year", "year"],
    ["CWA", "cwa"],
    ["WASSCE Aggregate", "wassceAggregate"],
    ["Final Score", "finalScore"],
    ["Scheme", "schemeName"],
    ["Academic Year", "academicYear"],
    ["Qualification Status", "qualificationStatus"],
    ["Interview Status", "interviewStatus"],
    ["Interview Score", "interviewScore"],
    ["Interview Date", "interviewDate"],
    ["Interview Notes", "interviewNotes"],
    ["Review Reason", "reviewReason"],
    ["Reviewer Notes", "reviewComment"],
    ["Screening Suggestion", "screeningDecision"],
    ["Name Mismatch", "nameMismatch"],
    ["Submitted At", "submittedAt"],
    ["Review Updated At", "reviewUpdatedAt"]
  ];

  appendSheet(workbook, `${decisionLabel} Applications`, [
    columns.map(([header]) => header),
    ...rows.map((row) => columns.map(([, key]) => row[key]))
  ]);

  appendSheet(workbook, "College Summary", [
    [
      "College",
      "Applications",
      "Reviewed",
      "Qualified",
      "Pending",
      "Disqualified",
      "Yet to Review",
      "Interview Pending",
      "Interview Scheduled",
      "Interview Completed",
      "Interview Waived"
    ],
    ...buildCollegeBreakdown(items).map((item) => [
      item.college,
      item.totalApplications,
      item.reviewedCount,
      item.qualifiedCount,
      item.pendingCount,
      item.disqualifiedCount,
      item.notReviewedCount,
      item.interviewPendingCount,
      item.interviewScheduledCount,
      item.interviewCompletedCount,
      item.interviewWaivedCount
    ])
  ]);

  appendSheet(workbook, "Export Summary", [
    ["Scheme", schemeName || "Not selected"],
    ["Academic Year", academicYearLabel || "Not selected"],
    ["Decision List", decisionLabel],
    ["Exported Rows", rows.length],
    ["Generated", new Date().toISOString().slice(0, 10)],
    ["Generated By", generatedBy || "System"]
  ]);

  const fileName = [
    slugify(decisionLabel) || "applications",
    "applications",
    slugify(schemeName) || "scheme",
    slugify(academicYearLabel) || "academic-year"
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
