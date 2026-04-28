import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createApp } from "../src/app.js";

function createRuntime(overrides = {}) {
  return {
    config: {
      auth: {
        mode: "password",
        requiredForWrite: true,
        sessionCookieName: "ssfs_session",
        sessionTtlHours: 12
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
        return null;
      },
      async login() {
        return {
          token: "signed-session-token",
          actor: {
            userId: "user-admin",
            fullName: "Platform Admin",
            username: "admin",
            roleCode: "admin",
            email: "admin@example.test",
            status: "active"
          }
        };
      },
      async logoutRequest() {
        return {
          loggedOut: true
        };
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
  req.socket = {
    remoteAddress: "127.0.0.1"
  };

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

async function loginSetsSessionCookieWithoutExposingTokenInJson() {
  const app = createApp(createRuntime());
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/auth/login",
    headers: {
      host: "127.0.0.1:4300",
      "content-type": "application/json"
    },
    body: [Buffer.from(JSON.stringify({ username: "admin", password: "StrongPass!23" }))]
  });

  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["cache-control"],
    "private, no-store, no-cache, max-age=0, must-revalidate"
  );
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.match(String(response.headers["set-cookie"] || ""), /ssfs_session=/u);
  assert.match(String(response.headers["set-cookie"] || ""), /HttpOnly/u);
  assert.match(String(response.headers["set-cookie"] || ""), /SameSite=Strict/u);
  assert.equal("token" in payload, false);
  assert.equal(payload.authenticated, true);
}

async function logoutClearsSessionCookie() {
  const app = createApp(
    createRuntime({
      authService: {
        async resolveRequestActor() {
          return {
            userId: "user-admin",
            fullName: "Platform Admin",
            username: "admin",
            roleCode: "admin",
            status: "active"
          };
        }
      }
    })
  );
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      host: "127.0.0.1:4300",
      cookie: "ssfs_session=signed-session-token"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["cache-control"],
    "private, no-store, no-cache, max-age=0, must-revalidate"
  );
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.match(String(response.headers["set-cookie"] || ""), /ssfs_session=/u);
  assert.match(String(response.headers["set-cookie"] || ""), /Max-Age=0/u);
}

await loginSetsSessionCookieWithoutExposingTokenInJson();
await logoutClearsSessionCookie();

console.log("auth-routes-tests: ok");
