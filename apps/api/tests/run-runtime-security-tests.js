import assert from "node:assert/strict";

import {
  assertApiRuntimeSecurity,
  assertWebRuntimeSecurity,
  createRuntimeDescriptor
} from "../../../scripts/runtimeSecurity.js";

function rejectsProductionApiWithoutPersistentDatabase() {
  assert.throws(
    () =>
      assertApiRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        config: {
          database: {
            enabled: false,
            url: ""
          },
          auth: {
            mode: "password",
            sessionSecret: "session-secret"
          },
          network: {
            trustedNetworks: ["127.0.0.1/32"]
          }
        },
        tlsConfig: {
          enabled: true
        },
        env: {}
      }),
    /DATABASE_URL/i
  );
}

function rejectsProductionApiWithoutPasswordAuth() {
  assert.throws(
    () =>
      assertApiRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        config: {
          database: {
            enabled: true,
            url: "postgres://example.test/app"
          },
          auth: {
            mode: "dev-token",
            sessionSecret: "session-secret"
          },
          network: {
            trustedNetworks: ["127.0.0.1/32"]
          }
        },
        tlsConfig: {
          enabled: true
        },
        env: {}
      }),
    /AUTH_MODE=password/i
  );
}

function rejectsProductionApiWithoutTlsOrTrustedNetworks() {
  assert.throws(
    () =>
      assertApiRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        config: {
          database: {
            enabled: true,
            url: "postgres://example.test/app"
          },
          auth: {
            mode: "password",
            sessionSecret: "session-secret"
          },
          network: {
            trustedNetworks: []
          }
        },
        tlsConfig: {
          enabled: false
        },
        env: {}
      }),
    /TLS|trusted networks/i
  );
}

function rejectsProductionApiWithInsecureTlsBypassFlags() {
  assert.throws(
    () =>
      assertApiRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        config: {
          database: {
            enabled: true,
            url: "postgres://example.test/app"
          },
          auth: {
            mode: "password",
            sessionSecret: "session-secret"
          },
          network: {
            trustedNetworks: ["127.0.0.1/32"]
          }
        },
        tlsConfig: {
          enabled: true
        },
        env: {
          PG_ALLOW_INVALID_CERTS: "true"
        }
      }),
    /invalid cert/i
  );
}

function allowsDevelopmentApiSampleMode() {
  assert.doesNotThrow(() =>
    assertApiRuntimeSecurity({
      runtime: createRuntimeDescriptor("development"),
      config: {
        database: {
          enabled: false,
          url: ""
        },
        auth: {
          mode: "dev-token",
          sessionSecret: ""
        },
        network: {
          trustedNetworks: []
        }
      },
      tlsConfig: {
        enabled: false
      },
      env: {}
    })
  );
}

function rejectsProductionWebWithoutTlsOrTrustedNetworks() {
  assert.throws(
    () =>
      assertWebRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        trustedNetworks: [],
        tlsConfig: {
          enabled: false
        },
        env: {}
      }),
    /TLS|trusted networks/i
  );
}

function rejectsProductionWebWithInvalidCertBypass() {
  assert.throws(
    () =>
      assertWebRuntimeSecurity({
        runtime: createRuntimeDescriptor("production"),
        trustedNetworks: ["127.0.0.1/32"],
        tlsConfig: {
          enabled: true
        },
        env: {
          API_PROXY_ALLOW_INVALID_CERTS: "true"
        }
      }),
    /invalid cert/i
  );
}

rejectsProductionApiWithoutPersistentDatabase();
rejectsProductionApiWithoutPasswordAuth();
rejectsProductionApiWithoutTlsOrTrustedNetworks();
rejectsProductionApiWithInsecureTlsBypassFlags();
allowsDevelopmentApiSampleMode();
rejectsProductionWebWithoutTlsOrTrustedNetworks();
rejectsProductionWebWithInvalidCertBypass();

console.log("runtime-security-tests: ok");
