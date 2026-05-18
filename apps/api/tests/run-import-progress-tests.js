import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  createImportProgressReporter,
  formatImportProgressEvent,
  wantsNdjsonProgress
} from "../src/lib/http.js";

function formatsProgressEventsAsNdjson() {
  assert.equal(
    formatImportProgressEvent({
      phase: "importing",
      processedRows: 25,
      totalRows: 100,
      message: "Importing rows"
    }),
    '{"type":"progress","phase":"importing","processedRows":25,"totalRows":100,"percent":25,"message":"Importing rows"}\n'
  );
}

function detectsNdjsonProgressRequests() {
  assert.equal(
    wantsNdjsonProgress({
      headers: {
        accept: "application/json, application/x-ndjson"
      }
    }),
    true
  );
  assert.equal(
    wantsNdjsonProgress({
      headers: {
        accept: "application/json"
      }
    }),
    false
  );
}

function reporterWritesProgressAndCompletionEvents() {
  const chunks = [];
  const res = {
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    write(chunk) {
      chunks.push(String(chunk));
    },
    end(chunk = "") {
      if (chunk) {
        chunks.push(String(chunk));
      }
      this.ended = true;
    }
  };
  const reporter = createImportProgressReporter(res);

  reporter.start();
  reporter.progress({
    phase: "validating",
    processedRows: 2,
    totalRows: 4,
    message: "Checking rows"
  });
  reporter.complete({
    ok: true,
    summary: {
      importedRows: 2
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/x-ndjson; charset=utf-8");
  const events = chunks
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(events[0], {
    type: "progress",
    phase: "validating",
    processedRows: 2,
    totalRows: 4,
    percent: 50,
    message: "Checking rows"
  });
  assert.deepEqual(events[1], {
    type: "complete",
    phase: "completed",
    processedRows: 0,
    totalRows: 0,
    percent: 100,
    message: "Import complete.",
    payload: {
      ok: true,
      summary: {
        importedRows: 2
      }
    }
  });
  assert.equal(res.ended, true);
}

function reporterStopsWritingAfterClientDisconnect() {
  const chunks = [];
  class FakeResponse extends EventEmitter {
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    }

    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }

    end(chunk = "") {
      if (chunk) {
        chunks.push(String(chunk));
      }
      this.ended = true;
    }
  }
  const res = new FakeResponse();
  const reporter = createImportProgressReporter(res);

  reporter.start();
  res.emit("close");
  reporter.progress({
    phase: "importing",
    processedRows: 1,
    totalRows: 3,
    message: "Importing rows"
  });
  reporter.complete({
    ok: true
  });

  assert.equal(reporter.isClosed(), true);
  assert.deepEqual(chunks, []);
  assert.equal(res.ended, undefined);
}

formatsProgressEventsAsNdjson();
detectsNdjsonProgressRequests();
reporterWritesProgressAndCompletionEvents();
reporterStopsWritingAfterClientDisconnect();

console.log("import-progress-tests: ok");
