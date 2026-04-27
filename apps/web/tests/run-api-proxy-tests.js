import assert from "node:assert/strict";

import {
  buildApiProxyTlsOptions,
  buildApiProxyTarget,
  shouldProxyToApi
} from "../src/apiProxy.js";

function proxiesApiRequestsOnly() {
  assert.equal(shouldProxyToApi("/api/auth/session"), true);
  assert.equal(shouldProxyToApi("/api/applications/messages/settings"), true);
  assert.equal(shouldProxyToApi("/index.html"), false);
  assert.equal(shouldProxyToApi("/src/app.js"), false);
}

function buildsLocalHttpsProxyTarget() {
  assert.equal(
    buildApiProxyTarget(
      {
        API_HOST: "0.0.0.0",
        API_PORT: "4300"
      },
      { enabled: true }
    ),
    "https://127.0.0.1:4300"
  );
}

function buildsLocalHttpProxyTargetWhenTlsDisabled() {
  assert.equal(
    buildApiProxyTarget(
      {
        API_HOST: "127.0.0.1",
        API_PORT: "4300"
      },
      { enabled: false }
    ),
    "http://127.0.0.1:4300"
  );
}

function fallsBackToDedicatedApiPortWhenOnlyWebPortIsConfigured() {
  assert.equal(
    buildApiProxyTarget(
      {
        API_HOST: "127.0.0.1",
        PORT: "4400"
      },
      { enabled: false }
    ),
    "http://127.0.0.1:4300"
  );
}

function usesStrictTlsVerificationByDefault() {
  assert.deepEqual(buildApiProxyTlsOptions({}), {
    rejectUnauthorized: true
  });
}

function allowsInsecureProxyTlsOnlyWhenExplicitlyEnabled() {
  assert.deepEqual(buildApiProxyTlsOptions({ API_PROXY_ALLOW_INVALID_CERTS: "true" }), {
    rejectUnauthorized: false
  });
}

proxiesApiRequestsOnly();
buildsLocalHttpsProxyTarget();
buildsLocalHttpProxyTargetWhenTlsDisabled();
fallsBackToDedicatedApiPortWhenOnlyWebPortIsConfigured();
usesStrictTlsVerificationByDefault();
allowsInsecureProxyTlsOnlyWhenExplicitlyEnabled();

console.log("api-proxy-tests: ok");
