import ExcelJS from "exceljs";

function createThinBorder() {
  return {
    top: { style: "thin", color: { argb: "FF233046" } },
    left: { style: "thin", color: { argb: "FF233046" } },
    bottom: { style: "thin", color: { argb: "FF233046" } },
    right: { style: "thin", color: { argb: "FF233046" } }
  };
}

function computeColumnWidth(header, rows, key) {
  let maxLen = String(header ?? "").length;
  for (const row of rows) {
    const value = row?.[key] ?? "";
    maxLen = Math.max(maxLen, String(value).length);
  }

  return Math.min(Math.max(maxLen + 4, 14), 34);
}

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

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "";
  }

  return numeric.toFixed(digits);
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

function styleWorksheet(worksheet, columns, rows, options = {}) {
  const fontName = options.fontName || "Constantia";
  const headerRowNumber = options.headerRowNumber || 5;
  const totalRowNumber = options.totalRowNumber || null;
  const currencyKeys = new Set(options.currencyKeys || []);
  const decimalKeys = new Set(options.decimalKeys || []);

  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = computeColumnWidth(column.header, rows, column.key);
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = columns[colNumber - 1];
      const key = column?.key || "";
      const isHeaderRow = rowNumber === headerRowNumber;
      const isTotalRow = totalRowNumber && rowNumber === totalRowNumber;

      cell.border = createThinBorder();
      cell.alignment = {
        vertical: "middle",
        horizontal: isHeaderRow ? "center" : "left",
        wrapText: true
      };
      cell.font = {
        name: fontName,
        size: isHeaderRow ? 11 : 10.5,
        bold: isHeaderRow || isTotalRow,
        color: isHeaderRow ? { argb: "FFF8FAFC" } : { argb: "FF1E293B" }
      };

      if (isHeaderRow) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F172A" }
        };
      } else if (isTotalRow) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE2E8F0" }
        };
      }

      if (!isHeaderRow && !isTotalRow) {
        if (currencyKeys.has(key)) {
          cell.numFmt = "#,##0.00";
          cell.alignment.horizontal = "right";
        } else if (decimalKeys.has(key)) {
          cell.numFmt = "0.00";
          cell.alignment.horizontal = "right";
        }
      }
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber, activeCell: "A1" }];
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columns.length }
  };
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
    cwa: item.cwa === null || item.cwa === undefined ? "" : Number(item.cwa),
    wassceAggregate:
      item.wassceAggregate === null || item.wassceAggregate === undefined
        ? ""
        : Number(item.wassceAggregate),
    finalScore:
      item.finalScore === null || item.finalScore === undefined ? "" : Number(item.finalScore),
    schemeName: item.schemeName || "",
    academicYear: item.cycleLabel || "",
    qualificationStatus: formatDecisionLabel(item.qualificationStatus),
    interviewStatus: item.interviewStatus || "",
    interviewScore:
      item.interviewScore === null || item.interviewScore === undefined
        ? ""
        : Number(item.interviewScore),
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

export async function buildApplicationsExportWorkbook({
  items,
  schemeName,
  academicYearLabel,
  qualificationStatus,
  fontName,
  generatedBy
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SSFS Scholarship Operations Hub";
  workbook.company = "SSFS Scholarship Operations Hub";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.lastModifiedBy = generatedBy || "System";

  const decisionLabel = formatDecisionLabel(qualificationStatus);
  const worksheet = workbook.addWorksheet(
    safeSheetName(`${decisionLabel} Applications`)
  );
  const rows = buildExportRows(items);

  const columns = [
    { header: "Student Reference ID", key: "studentReferenceId" },
    { header: "Registry Name", key: "registryName" },
    { header: "Uploaded Name", key: "uploadedName" },
    { header: "Uploaded Reference ID", key: "uploadedReferenceId" },
    { header: "Index Number", key: "indexNumber" },
    { header: "Phone Number", key: "phoneNumber" },
    { header: "College", key: "college" },
    { header: "Programme", key: "program" },
    { header: "Year", key: "year" },
    { header: "CWA", key: "cwa" },
    { header: "WASSCE Aggregate", key: "wassceAggregate" },
    { header: "Final Score", key: "finalScore" },
    { header: "Scheme", key: "schemeName" },
    { header: "Academic Year", key: "academicYear" },
    { header: "Qualification Status", key: "qualificationStatus" },
    { header: "Interview Status", key: "interviewStatus" },
    { header: "Interview Score", key: "interviewScore" },
    { header: "Interview Date", key: "interviewDate" },
    { header: "Interview Notes", key: "interviewNotes" },
    { header: "Review Reason", key: "reviewReason" },
    { header: "Reviewer Notes", key: "reviewComment" },
    { header: "Screening Suggestion", key: "screeningDecision" },
    { header: "Name Mismatch", key: "nameMismatch" },
    { header: "Submitted At", key: "submittedAt" },
    { header: "Review Updated At", key: "reviewUpdatedAt" }
  ];

  worksheet.mergeCells("A1:H1");
  worksheet.getCell("A1").value = "SSFS Scholarship Operations Hub";
  worksheet.getCell("A1").font = { name: fontName, size: 16, bold: true, color: { argb: "FF0F172A" } };

  worksheet.mergeCells("A2:H2");
  worksheet.getCell("A2").value = `${decisionLabel} Applications Export`;
  worksheet.getCell("A2").font = { name: fontName, size: 13, bold: true, color: { argb: "FF1E293B" } };

  worksheet.getCell("A3").value = "Scheme";
  worksheet.getCell("B3").value = schemeName || "Not selected";
  worksheet.getCell("C3").value = "Academic Year";
  worksheet.getCell("D3").value = academicYearLabel || "Not selected";
  worksheet.getCell("E3").value = "Exported Rows";
  worksheet.getCell("F3").value = rows.length;
  worksheet.getCell("G3").value = "Generated";
  worksheet.getCell("H3").value = new Date().toISOString().slice(0, 10);

  for (const cellRef of ["A3", "C3", "E3", "G3"]) {
    worksheet.getCell(cellRef).font = { name: fontName, size: 10.5, bold: true, color: { argb: "FF0F172A" } };
  }
  for (const cellRef of ["B3", "D3", "F3", "H3"]) {
    worksheet.getCell(cellRef).font = { name: fontName, size: 10.5, color: { argb: "FF334155" } };
  }

  worksheet.addRow(columns.map((column) => column.header));
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => row[column.key]));
  });

  const totalRowValues = columns.map((column) => {
    if (column.key === "registryName") {
      return "Totals";
    }
    return "";
  });
  worksheet.addRow(totalRowValues);

  styleWorksheet(worksheet, columns, rows, {
    fontName,
    headerRowNumber: 4,
    totalRowNumber: rows.length + 5,
    decimalKeys: ["cwa", "wassceAggregate", "finalScore", "interviewScore"]
  });

  const fileName = [
    slugify(decisionLabel) || "applications",
    "applications",
    slugify(schemeName) || "scheme",
    slugify(academicYearLabel) || "academic-year"
  ]
    .filter(Boolean)
    .join("-")
    .concat(".xlsx");

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName
  };
}
