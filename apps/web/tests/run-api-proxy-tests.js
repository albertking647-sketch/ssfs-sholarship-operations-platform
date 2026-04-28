import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import {
  buildApiProxyHeaders,
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

function trustsConfiguredPemCertificateWhenApiTlsIsEnabled() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssfs-api-proxy-test-"));
  const pemPath = path.join(tempDir, "ssfs-local-network.pem");
  fs.writeFileSync(
    pemPath,
    "-----BEGIN CERTIFICATE-----\nMIIBhTCCASugAwIBAgIUeW1wb3J0YW50LXRlc3QtY2VydGlmaWNhdGUwCgYIKoZIzj0EAwIw\nEjEQMA4GA1UEAwwHdGVzdC1jYTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAwMDBaMBIx\nEDAOBgNVBAMMB3Rlc3QtY2EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAT0s4gk8lN8Y9qs\nN6M9x8M4y8D2k4p4s1rM8eYwQJtV6V8X8sM4l0m4i6fQh5r0pX9x3i0Qk0fJ5oKp8wSYo1MwUTAd\nBgNVHQ4EFgQUwL8kQW4QX8eVYQJv3A7gkWlQm8UwHwYDVR0jBBgwFoAUwL8kQW4QX8eVYQJv3A7g\nkWlQm8UwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA0v1mQKJm9JcU1v0P0b8Q\n2VJ2gB6G9mS6V2mA6lQw8PECIBQv6oA0P6Y0w0Yx2DkT2jQkz7R4mK6u5B6M1n4l6R2b\n-----END CERTIFICATE-----\n",
    "utf8"
  );
  const tlsOptions = buildApiProxyTlsOptions(
    {},
    {
      enabled: true,
      certPath: pemPath
    }
  );

  assert.equal(tlsOptions.rejectUnauthorized, true);
  assert.equal(typeof tlsOptions.ca, "string");
  assert.match(tlsOptions.ca, /BEGIN CERTIFICATE/);

  fs.rmSync(tempDir, { recursive: true, force: true });
}

function ignoresLegacyPfxCertificateAuthorityFallback() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssfs-api-proxy-test-"));
  const pfxPath = path.join(tempDir, "ssfs-local-network.pfx");
  const pemPath = path.join(tempDir, "ssfs-local-network.pem");
  fs.writeFileSync(pfxPath, Buffer.from("legacy-pfx"));
  fs.writeFileSync(
    pemPath,
    "-----BEGIN CERTIFICATE-----\nlegacy-test-ca\n-----END CERTIFICATE-----\n",
    "utf8"
  );

  const tlsOptions = buildApiProxyTlsOptions(
    {},
    {
      enabled: true,
      pfxPath
    }
  );

  assert.deepEqual(tlsOptions, {
    rejectUnauthorized: true
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
}

function stripsBrowserOriginWhenProxyingToLocalApi() {
  const headers = buildApiProxyHeaders(
    {
      origin: "https://127.0.0.1:4400",
      host: "127.0.0.1:4400",
      authorization: "Bearer test-token"
    },
    new URL("https://127.0.0.1:4300")
  );

  assert.equal(headers.origin, undefined);
  assert.equal(headers.host, "127.0.0.1:4300");
  assert.equal(headers.authorization, "Bearer test-token");
}

proxiesApiRequestsOnly();
buildsLocalHttpsProxyTarget();
buildsLocalHttpProxyTargetWhenTlsDisabled();
fallsBackToDedicatedApiPortWhenOnlyWebPortIsConfigured();
usesStrictTlsVerificationByDefault();
allowsInsecureProxyTlsOnlyWhenExplicitlyEnabled();
trustsConfiguredPemCertificateWhenApiTlsIsEnabled();
ignoresLegacyPfxCertificateAuthorityFallback();
stripsBrowserOriginWhenProxyingToLocalApi();

console.log("api-proxy-tests: ok");
