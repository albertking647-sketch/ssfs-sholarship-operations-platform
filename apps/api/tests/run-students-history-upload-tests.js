import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { utils, write } from "xlsx";

import { resolveStudentHistoryImportPayload } from "../src/modules/students/historyUpload.js";

function createMultipartRequest({ boundary, fileName, fileBuffer, fields = {} }) {
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, "utf8"));
    chunks.push(
      Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "utf8")
    );
  }

  chunks.push(Buffer.from(`--${boundary}\r\n`, "utf8"));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n",
      "utf8"
    )
  );
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));

  const request = Readable.from([Buffer.concat(chunks)]);
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`
  };
  return request;
}

async function sisStyleWorkbookRowsUseRowLevelIdentifiersProgramAndYear() {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    [
      "KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY, KUMASI\nCOLLEGE OF SCIENCE\nUNDERGRADUATE STUDENTS WITH CWA OF 20.00 AND ABOVE",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    ["", "STUDENTID", "INDEX NO.", "NAME", "GENDER", "PROGRAMME", "CWA"],
    ["", "BSC. BIOCHEMISTRY (2 Students)", "", "", "", "", ""],
    ["", "20261234", "8637723", "AKOSUA MENSAH", "F", "BSC. BIOCHEMISTRY", "82.45"],
    ["", "20264321", "PG8637723", "KWAME ARTHUR", "M", "BSC. FOOD SCIENCE", "70.50"]
  ]);
  utils.book_append_sheet(workbook, sheet, "CWA Above In College");

  const request = createMultipartRequest({
    boundary: "sis-cwa-boundary",
    fileName: "Year 1.xlsx",
    fileBuffer: write(workbook, { type: "buffer", bookType: "xlsx" }),
    fields: {
      academicYearLabel: "2026/2027",
      semesterLabel: "Final Results"
    }
  });

  const payload = await resolveStudentHistoryImportPayload(request, 1024 * 1024);

  assert.equal(payload.rows.length, 2);
  assert.deepEqual(payload.rows[0], {
    "Reference Number": "20261234",
    "Index Number": "8637723",
    "Full Name": "AKOSUA MENSAH",
    CWA: "82.45",
    "Academic Year": "2026/2027",
    "Semester Label": "Final Results",
    College: "College of Science",
    "Programme of Study": "BSC. BIOCHEMISTRY",
    Year: "Year 1",
    Notes: "Year 1.xlsx / CWA Above In College"
  });
  assert.equal(payload.rows[1]["Programme of Study"], "BSC. FOOD SCIENCE");
}

async function sisStyleWorkbookDoesNotUseHeadersOrStudentRowsAsProgrammeFallback() {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    [
      "KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY, KUMASI\nCOLLEGE OF AGRICULTURE AND NATURAL RESOURCES\nUNDERGRADUATE STUDENTS WITH CWA OF 20.00 AND ABOVE",
      "",
      "",
      "",
      "",
      ""
    ],
    ["", "STUDENTID", "INDEX NO.", "NAME", "GENDER", "CWA"],
    ["", "21891804", "9923525", "OPPONG, Derrick Kyeremeh Kwame", "M", "87.00"],
    ["", "21858361", "9910825", "AGBENOLAWODZE, Kwesi Vincent", "M", "85.00"]
  ]);
  utils.book_append_sheet(workbook, sheet, "CWA Above In College");

  const request = createMultipartRequest({
    boundary: "sis-cwa-no-programme-boundary",
    fileName: "Year 1.xlsx",
    fileBuffer: write(workbook, { type: "buffer", bookType: "xlsx" }),
    fields: {
      academicYearLabel: "2025/2026",
      semesterLabel: "Second Semester"
    }
  });

  const payload = await resolveStudentHistoryImportPayload(request, 1024 * 1024);

  assert.equal(payload.rows.length, 2);
  assert.equal(payload.rows[0]["Programme of Study"], "");
  assert.equal(payload.rows[1]["Programme of Study"], "");
}

await sisStyleWorkbookRowsUseRowLevelIdentifiersProgramAndYear();
await sisStyleWorkbookDoesNotUseHeadersOrStudentRowsAsProgrammeFallback();

console.log("students-history-upload-tests: ok");
