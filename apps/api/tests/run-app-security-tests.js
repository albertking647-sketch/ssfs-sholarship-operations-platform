import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

import { createApp } from "../src/app.js";
import { TooManyRequestsError } from "../src/lib/errors.js";

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

async function allowsSameOriginRequestsWithoutExplicitCorsAllowlist() {
  const app = createApp(
    createRuntime({
      config: {
        cors: {
          allowedOrigins: []
        }
      }
    })
  );
  const response = await invokeApp(app, {
    method: "GET",
    url: "/api/auth/session",
    headers: {
      host: "staff.example.test",
      origin: "https://staff.example.test",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "https://staff.example.test");
}

async function loginRateLimitResponsesIncludeRetryAfter() {
  const app = createApp(
    createRuntime({
      authService: {
        async resolveRequestActor() {
          return null;
        },
        async login() {
          throw new TooManyRequestsError(
            "Too many login attempts. Please wait before trying again.",
            30
          );
        }
      }
    })
  );
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/auth/login",
    headers: {
      host: "127.0.0.1:4300",
      "content-type": "application/json"
    },
    body: [Buffer.from(JSON.stringify({ username: "admin", password: "wrong-password" }))]
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "30");
}

async function authRoutesUseScopedRequestBodyLimits() {
  const app = createApp(
    createRuntime({
      config: {
        limits: {
          jsonBodyBytes: 1024 * 1024,
          authJsonBodyBytes: 32
        }
      }
    })
  );
  const response = await invokeApp(app, {
    method: "POST",
    url: "/api/auth/login",
    headers: {
      host: "127.0.0.1:4300",
      "content-type": "application/json"
    },
    body: [Buffer.from(JSON.stringify({ username: "admin", password: "this-password-payload-is-too-large" }))]
  });

  assert.equal(response.statusCode, 413);
}

async function healthAndApiMetadataDoNotLeakInternalConfiguration() {
  const app = createApp(createRuntime());

  const healthResponse = await invokeApp(app, {
    method: "GET",
    url: "/health",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const healthPayload = JSON.parse(healthResponse.body);
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthPayload.ok, true);
  assert.equal("dataSource" in healthPayload, false);
  assert.equal("database" in healthPayload, false);
  assert.equal("authMode" in healthPayload, false);

  const apiResponse = await invokeApp(app, {
    method: "GET",
    url: "/api",
    headers: {
      host: "127.0.0.1:4300"
    }
  });
  const apiPayload = JSON.parse(apiResponse.body);
  assert.equal(apiResponse.statusCode, 200);
  assert.equal(apiPayload.ok, true);
  assert.equal("dataSource" in apiPayload, false);
  assert.equal("auth" in apiPayload, false);
  assert.equal("modules" in apiPayload, false);
}

async function apiResponsesIncludeSecurityHeaders() {
  const app = createApp(createRuntime());
  const response = await invokeApp(app, {
    method: "GET",
    url: "/health",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(
    response.headers["cache-control"],
    "private, no-store, no-cache, max-age=0, must-revalidate"
  );
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(response.headers.expires, "0");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
}

function configDoesNotShipHardcodedDemoBearerTokens() {
  const source = readFileSync(new URL("../src/config.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /admin-demo-token|reviewer-demo-token|auditor-demo-token/u);
}

await rejectsApplicationReadsWithoutAuthentication();
await rejectsUnexpectedCrossOriginRequests();
await allowsConfiguredTrustedOrigins();
await allowsSameOriginRequestsWithoutExplicitCorsAllowlist();
await loginRateLimitResponsesIncludeRetryAfter();
await authRoutesUseScopedRequestBodyLimits();
await healthAndApiMetadataDoNotLeakInternalConfiguration();
await apiResponsesIncludeSecurityHeaders();
configDoesNotShipHardcodedDemoBearerTokens();

console.log("app-security-tests: ok");
