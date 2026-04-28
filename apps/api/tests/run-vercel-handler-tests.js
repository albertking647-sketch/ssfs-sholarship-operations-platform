import assert from "node:assert/strict";

import {
  createVercelApiHandler,
  resolveVercelRequestUrl
} from "../src/vercel/handler.js";

function rewritesPathOverrideIntoNodeStyleRequestUrl() {
  assert.equal(
    resolveVercelRequestUrl("/api?__pathname=%2Fapi%2Fauth%2Fsession"),
    "/api/auth/session"
  );
  assert.equal(
    resolveVercelRequestUrl("/api?__pathname=%2Fapi%2Fapplications&scheme=Merit&year=2026"),
    "/api/applications?scheme=Merit&year=2026"
  );
  assert.equal(resolveVercelRequestUrl("/health"), "/health");
}

async function cachesRuntimeAndAppAcrossRequests() {
  let runtimeCalls = 0;
  let appCalls = 0;
  const seenUrls = [];
  const handler = createVercelApiHandler({
    configValue: { name: "test-config" },
    async createRuntimeFn(config) {
      runtimeCalls += 1;
      return { config };
    },
    createAppFn(runtime) {
      appCalls += 1;
      return async function app(req, res) {
        seenUrls.push(req.url);
        res.runtimeName = runtime.config.name;
      };
    }
  });

  const firstResponse = {};
  const secondResponse = {};

  await handler(
    { url: "/api?__pathname=%2Fapi%2Fauth%2Fsession" },
    firstResponse
  );
  await handler(
    { url: "/api?__pathname=%2Fapi%2Fauth%2Fusers&limit=10" },
    secondResponse
  );

  assert.equal(runtimeCalls, 1);
  assert.equal(appCalls, 1);
  assert.deepEqual(seenUrls, ["/api/auth/session", "/api/auth/users?limit=10"]);
  assert.equal(firstResponse.runtimeName, "test-config");
  assert.equal(secondResponse.runtimeName, "test-config");
}

async function rejectsRequestsFromUntrustedForwardedNetworks() {
  let appCalls = 0;
  const handler = createVercelApiHandler({
    configValue: { name: "test-config" },
    async createRuntimeFn(config) {
      return {
        config: {
          ...config,
          network: {
            trustedNetworks: ["127.0.0.1/32"]
          }
        }
      };
    },
    createAppFn() {
      return async function app() {
        appCalls += 1;
      };
    }
  });

  const response = {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };

  await handler(
    {
      url: "/api?__pathname=%2Fapi%2Fauth%2Fsession",
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.5"
      },
      socket: {
        remoteAddress: "10.0.0.5"
      }
    },
    response
  );

  assert.equal(appCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.match(response.headers["Content-Type"], /application\/json/u);
  assert.match(response.body, /approved local networks/u);
  assert.match(response.body, /203\.0\.113\.7/u);
}

async function allowsRequestsFromTrustedForwardedNetworks() {
  let seenRemoteAddress = "";
  const handler = createVercelApiHandler({
    configValue: { name: "test-config" },
    async createRuntimeFn(config) {
      return {
        config: {
          ...config,
          network: {
            trustedNetworks: ["203.0.113.0/24"]
          }
        }
      };
    },
    createAppFn() {
      return async function app(req, res) {
        seenRemoteAddress = req.headers["x-forwarded-for"];
        res.allowed = true;
      };
    }
  });

  const response = {};

  await handler(
    {
      url: "/api?__pathname=%2Fapi%2Fauth%2Fsession",
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.5"
      },
      socket: {
        remoteAddress: "10.0.0.5"
      }
    },
    response
  );

  assert.equal(response.allowed, true);
  assert.equal(seenRemoteAddress, "203.0.113.7, 10.0.0.5");
}

rewritesPathOverrideIntoNodeStyleRequestUrl();
await cachesRuntimeAndAppAcrossRequests();
await rejectsRequestsFromUntrustedForwardedNetworks();
await allowsRequestsFromTrustedForwardedNetworks();

console.log("vercel-handler-tests: ok");
