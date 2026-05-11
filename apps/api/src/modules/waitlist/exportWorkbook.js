import * as XLSX from "xlsx";

const COLUMN_HEADERS = [
  "Full name",
  "Student reference ID",
  "Index number",
  "Email",
  "College",
  "Programme",
  "Year of study",
  "Scheme",
  "Academic year",
  "Status",
  "Recommendation reason",
  "Notes",
  "Linked application ID",
  "Linked beneficiary ID",
  "Source type",
  "Source file",
  "Import batch reference",
  "Record ID",
  "Student ID",
  "Scheme ID",
  "Cycle ID",
  "Created at",
  "Updated at"
];

function formatStatus(value) {
  switch (String(value || "").trim()) {
    case "awaiting_support":
      return "Awaiting support";
    case "supported":
      return "Supported";
    default:
      return String(value || "");
  }
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function mapItemToRow(item) {
  return {
    "Full name": item.fullName || item.studentName || "",
    "Student reference ID": item.studentReferenceId || "",
    "Index number": item.indexNumber || "",
    Email: item.email || "",
    College: item.college || "",
    Programme: item.program || "",
    "Year of study": item.year ?? "",
    Scheme: item.schemeName || "",
    "Academic year": item.cycleLabel || "",
    Status: formatStatus(item.status),
    "Recommendation reason": item.recommendationReason || "",
    Notes: item.notes || "",
    "Linked application ID": item.linkedApplicationId || "",
    "Linked beneficiary ID": item.linkedBeneficiaryId || "",
    "Source type": item.sourceType || "",
    "Source file": item.sourceFileName || "",
    "Import batch reference": item.importBatchReference || "",
    "Record ID": item.id || "",
    "Student ID": item.studentId || "",
    "Scheme ID": item.schemeId || "",
    "Cycle ID": item.cycleId || "",
    "Created at": formatDateTime(item.createdAt),
    "Updated at": formatDateTime(item.updatedAt)
  };
}

export function buildRecommendedStudentsExportBuffer(items = []) {
  const rows = (items || []).map(mapItemToRow);
  const worksheet = rows.length
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([COLUMN_HEADERS]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Recommended students");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildRecommendedStudentsExportFileName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `recommended-students-${stamp}.xlsx`;
}
