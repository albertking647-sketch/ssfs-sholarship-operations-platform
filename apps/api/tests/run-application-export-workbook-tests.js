import assert from "node:assert/strict";
import { read, utils } from "xlsx";

import { buildApplicationsExportWorkbook } from "../src/modules/applications/exportWorkbook.js";

async function exportWorkbookIncludesApplicationAndCollegeSummarySheets() {
  const result = await buildApplicationsExportWorkbook({
    items: [
      {
        studentReferenceId: "20260001",
        studentName: "Ama Mensah",
        college: "Engineering",
        program: "Computer Engineering",
        year: "2",
        cwa: 78.5,
        wassceAggregate: 12,
        qualificationStatus: "qualified",
        interviewStatus: "completed",
        interviewScore: 86,
        schemeName: "SRC Bursary",
        cycleLabel: "2026/2027 Academic Year"
      },
      {
        studentReferenceId: "20260002",
        studentName: "Kojo Appiah",
        college: "Science",
        program: "Biochemistry",
        year: "1",
        qualificationStatus: "qualified",
        interviewStatus: "scheduled",
        schemeName: "SRC Bursary",
        cycleLabel: "2026/2027 Academic Year"
      }
    ],
    schemeName: "SRC Bursary",
    academicYearLabel: "2026/2027 Academic Year",
    qualificationStatus: "qualified",
    fontName: "Constantia",
    generatedBy: "Admin User"
  });

  assert.match(result.fileName, /qualified-applications-src-bursary-2026-2027-academic-year\.xlsx/);
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 0);

  const workbook = read(result.buffer, { type: "buffer" });
  assert.ok(workbook.SheetNames.includes("Qualified Applications"));
  assert.ok(workbook.SheetNames.includes("College Summary"));
  assert.ok(workbook.SheetNames.includes("Export Summary"));

  const collegeRows = utils.sheet_to_json(workbook.Sheets["College Summary"], {
    header: 1,
    defval: ""
  });
  assert.deepEqual(collegeRows[0], [
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
  ]);
  assert.deepEqual(collegeRows[1], ["Engineering", 1, 1, 1, 0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(collegeRows[2], ["Science", 1, 1, 1, 0, 0, 0, 0, 1, 0, 0]);
}

await exportWorkbookIncludesApplicationAndCollegeSummarySheets();

console.log("application-export-workbook-tests: ok");
