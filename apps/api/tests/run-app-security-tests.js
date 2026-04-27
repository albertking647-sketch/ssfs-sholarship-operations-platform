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
      cors: {
        allowedOrigins: ["http://127.0.0.1:4400"]
      },
      ...overrides.config
    },
    database: {
      async healthCheck() {
        return {
          mode: "sample",
          status: "ready"
        };
      }
    },
    dataSource: "sample",
    authService: {
      async resolveRequestActor() {
        return null;
      },
      ...overrides.authService
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

async function rejectsApplicationReadsWithoutAuthentication() {
  const app = createApp(createRuntime());
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/applications",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(response.statusCode, 401);
}

async function rejectsUnexpectedCrossOriginRequests() {
  const app = createApp(createRuntime());
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/auth/session",
    headers: {
      host: "127.0.0.1:4300",
      origin: "https://evil.example"
    }
  });

  assert.equal(response.statusCode, 403);
}

async function allowsConfiguredTrustedOrigins() {
  const app = createApp(
    createRuntime({
      authService: {
        async resolveRequestActor() {
          return {
            userId: "user-admin",
            roleCode: "admin",
            fullName: "Platform Admin"
          };
        }
      }
    })
  );
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/auth/session",
    headers: {
      host: "127.0.0.1:4300",
      origin: "http://127.0.0.1:4400"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:4400");
}

await rejectsApplicationReadsWithoutAuthentication();
await rejectsUnexpectedCrossOriginRequests();
await allowsConfiguredTrustedOrigins();

console.log("app-security-tests: ok");
