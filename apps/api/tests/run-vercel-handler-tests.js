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

rewritesPathOverrideIntoNodeStyleRequestUrl();
await cachesRuntimeAndAppAcrossRequests();

console.log("vercel-handler-tests: ok");
