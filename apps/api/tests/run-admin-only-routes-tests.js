import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createApp } from "../src/app.js";

function createRuntime(roleCode = "admin", overrides = {}) {
  return {
    config: {
      auth: {
        mode: "password",
        requiredForWrite: true
      },
      limits: {
        jsonBodyBytes: 1024 * 1024,
        authJsonBodyBytes: 16 * 1024
      },
      cors: {
        allowedOrigins: []
      },
      ...overrides.config
    },
    database: {
      async healthCheck() {
        return { mode: "sample", status: "ready" };
      }
    },
    dataSource: "sample",
    authService: {
      async resolveRequestActor() {
        return {
          userId: `user-${roleCode}`,
          fullName: `${roleCode} User`,
          roleCode,
          status: "active"
        };
      }
    },
    services: {
      applications: {
        async list() {
          return [];
        },
        async summary() {
          return {
            totalApplications: 0,
            reviewedCount: 0,
            qualifiedCount: 0,
            pendingCount: 0,
            disqualifiedCount: 0,
            notReviewedCount: 0
          };
        },
        async cwaCoverage() {
          return {
            summary: {
              totalApplications: 0,
              matchedCwaCount: 0,
              missingCwaCount: 0,
              coveragePercentage: 0
            },
            missingItems: [],
            totalMissingItems: 0,
            returnedMissingItems: 0,
            missingItemsTruncated: false
          };
        },
        async bulkUpdateInterview() {
          return {
            summary: {
              updatedApplications: 0
            },
            updatedApplications: 0
          };
        }
      },
      beneficiaries: {
        async listDuplicateSupports() {
          return {
            summary: {
              unresolvedCount: 0,
              awaitingResponseCount: 0,
              resolvedCount: 0
            },
            items: [],
            filterOptions: {
              academicYears: [],
              schemeNames: []
            }
          };
        }
      },
      ...overrides.services
    }
  };
}

async function invokeApp(app, { method, url, headers = {}, body = [] }) {
  const req = Readable.from(body);
  req.method = method;
  req.url = url;
  req.headers = headers;

  const response = {
    statusCode: 200,
    headers: {},
    body: ""
  };

  const res = {
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
    },
    writeHead(statusCode, headersObject = {}) {
      response.statusCode = statusCode;
      for (const [name, value] of Object.entries(headersObject)) {
        response.headers[String(name).toLowerCase()] = value;
      }
    },
    end(chunk = "") {
      response.body += chunk ? String(chunk) : "";
    }
  };

  await app(req, res);
  return response;
}

async function reviewerCannotUseAdminOnlyDuplicateSupports() {
  const app = createApp(createRuntime("reviewer"));
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/beneficiaries/duplicates",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(response.statusCode, 403);
}

async function adminCanLoadDuplicateSupports() {
  const app = createApp(createRuntime("admin"));
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/beneficiaries/duplicates",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.unresolvedCount, 0);
}

async function reviewerCannotBulkUpdateInterviews() {
  const app = createApp(createRuntime("reviewer"));
  const response = await invokeApp(app, {
    method: "PUT",
    url: "/api/applications/interview-bulk",
    headers: {
      host: "127.0.0.1:4300",
      "content-type": "application/json"
    },
    body: [
      Buffer.from(
        JSON.stringify({
          schemeId: "scheme-1",
          cycleId: "cycle-1",
          interviewStatus: "completed"
        })
      )
    ]
  });

  assert.equal(response.statusCode, 403);
}

async function adminCanBulkUpdateInterviews() {
  const app = createApp(createRuntime("admin"));
  const response = await invokeApp(app, {
    method: "PUT",
    url: "/api/applications/interview-bulk",
    headers: {
      host: "127.0.0.1:4300",
      "content-type": "application/json"
    },
    body: [
      Buffer.from(
        JSON.stringify({
          schemeId: "scheme-1",
          cycleId: "cycle-1",
          interviewStatus: "completed"
        })
      )
    ]
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
}

await reviewerCannotUseAdminOnlyDuplicateSupports();
await adminCanLoadDuplicateSupports();
await reviewerCannotBulkUpdateInterviews();
await adminCanBulkUpdateInterviews();

console.log("admin-only-routes-tests: ok");
