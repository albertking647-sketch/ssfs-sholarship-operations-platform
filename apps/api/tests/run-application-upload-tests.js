import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { utils, write } from "xlsx";

import { resolveApplicationImportPayload } from "../src/modules/applications/upload.js";

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

  const body = Buffer.concat(chunks);
  const request = Readable.from([body]);
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`
  };
  return request;
}

async function uploadedWorkbookMapsPhoneNumberColumn() {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["REFERENCE NO.", "NAME", "EMAIL", "Phone Number", "PROGRAMME", "YEAR"],
    [
      "22684353",
      "TETTEH Joy Dede",
      "tettehjoy67@gmail.com",
      "0241333439",
      "Biochemistry",
      "2nd Year"
    ]
  ]);
  utils.book_append_sheet(workbook, sheet, "Applications");
  const buffer = write(workbook, { type: "buffer", bookType: "xlsx" });
  const request = createMultipartRequest({
    boundary: "application-upload-boundary",
    fileName: "applications.xlsx",
    fileBuffer: buffer,
    fields: {
      schemeId: "scheme-1",
      cycleId: "cycle-1"
    }
  });

  const payload = await resolveApplicationImportPayload(request, 1024 * 1024);

  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0]["Phone Number"], "0241333439");
}

await uploadedWorkbookMapsPhoneNumberColumn();

console.log("application-upload-tests: ok");
