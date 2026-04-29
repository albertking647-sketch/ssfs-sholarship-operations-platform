import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createApp } from "../src/app.js";

function createRuntime(overrides = {}) {
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
        return { status: "ready" };
      }
    },
    authService: {
      async resolveRequestActor() {
        return null;
      },
      ...overrides.authService
    },
    services: {
      schemes: {
        async list() {
          return [{ id: "scheme-1", name: "Merit Scholarship" }];
        }
      },
      cycles: {
        async list() {
          return [{ id: "cycle-1", label: "2026/2027 Academic Year" }];
        }
      },
      applicationCriteria: {
        async getBySchemeCycle() {
          return { schemeId: "scheme-1", cycleId: "cycle-1" };
        }
      },
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
        }
      },
      ...overrides.services
    }
  };
}

async function invokeApp(app, { method, url, headers = {} }) {
  const req = Readable.from([]);
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

async function rejectsUnauthenticatedReadOfInternalReferenceData() {
  const app = createApp(createRuntime());

  for (const url of [
    "/api/schemes",
    "/api/cycles",
    "/api/application-criteria?schemeId=scheme-1&cycleId=cycle-1"
  ]) {
    const response = await invokeApp(app, {
      method: "GET",
      url,
      headers: {
        host: "127.0.0.1:4300"
      }
    });

    assert.equal(response.statusCode, 401, `expected ${url} to require authentication`);
  }
}

async function reviewerCanReadSchemesCyclesAndCriteria() {
  const app = createApp(
    createRuntime({
      authService: {
        async resolveRequestActor() {
          return {
            userId: "user-reviewer",
            roleCode: "reviewer",
            fullName: "Application Reviewer"
          };
        }
      }
    })
  );

  const schemesResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/schemes",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const cyclesResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/cycles",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const criteriaResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/application-criteria?schemeId=scheme-1&cycleId=cycle-1",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(schemesResponse.statusCode, 200);
  assert.equal(cyclesResponse.statusCode, 200);
  assert.equal(criteriaResponse.statusCode, 200);
}

async function auditorCanReadSchemesAndCyclesButNotCriteria() {
  const app = createApp(
    createRuntime({
      authService: {
        async resolveRequestActor() {
          return {
            userId: "user-auditor",
            roleCode: "auditor",
            fullName: "Audit Officer"
          };
        }
      }
    })
  );

  const schemesResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/schemes",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const cyclesResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/cycles",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const criteriaResponse = await invokeApp(app, {
    method: "GET",
    url: "/api/application-criteria?schemeId=scheme-1&cycleId=cycle-1",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(schemesResponse.statusCode, 200);
  assert.equal(cyclesResponse.statusCode, 200);
  assert.equal(criteriaResponse.statusCode, 403);
}

await rejectsUnauthenticatedReadOfInternalReferenceData();
await reviewerCanReadSchemesCyclesAndCriteria();
await auditorCanReadSchemesAndCyclesButNotCriteria();

console.log("internal-auth-surface-tests: ok");
