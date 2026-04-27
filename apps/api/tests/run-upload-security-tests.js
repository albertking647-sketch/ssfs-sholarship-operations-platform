import assert from "node:assert/strict";

import { AppError } from "../src/lib/errors.js";
import {
  assertAcceptedUploadCount,
  assertSafeSpreadsheetUpload
} from "../src/lib/uploadSecurity.js";

function acceptsPlainTextCsvUploads() {
  const result = assertSafeSpreadsheetUpload(
    {
      filename: "students.csv",
      body: Buffer.from("name,ref\nAda,1001\n", "utf8")
    },
    "student imports"
  );

  assert.equal(result.extension, ".csv");
  assert.equal(result.fileName, "students.csv");
}

function rejectsBinaryCsvUploads() {
  assert.throws(
    () =>
      assertSafeSpreadsheetUpload(
        {
          filename: "students.csv",
          body: Buffer.from([0x41, 0x00, 0x42])
        },
        "student imports"
      ),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /plain text/i);
      return true;
    }
  );
}

function rejectsSpoofedWorkbookUploads() {
  assert.throws(
    () =>
      assertSafeSpreadsheetUpload(
        {
          filename: "applications.xlsx",
          body: Buffer.from("not-a-zip-workbook", "utf8")
        },
        "application imports"
      ),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /valid excel workbook/i);
      return true;
    }
  );
}

function rejectsExcessiveFileCounts() {
  assert.throws(
    () => assertAcceptedUploadCount(new Array(13).fill({}), "Application import"),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /at most 12 files/i);
      return true;
    }
  );
}

acceptsPlainTextCsvUploads();
rejectsBinaryCsvUploads();
rejectsSpoofedWorkbookUploads();
rejectsExcessiveFileCounts();

console.log("upload-security-tests: ok");
