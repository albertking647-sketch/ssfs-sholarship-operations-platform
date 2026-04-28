import assert from "node:assert/strict";

import { buildHostedDatabaseSslConfig } from "../scripts/hostedSsl.js";

function requiresHostedCaCertificatePath() {
  assert.throws(
    () => buildHostedDatabaseSslConfig({}, "C:/repo"),
    /DB_SSL_CA_CERT_PATH/u
  );
}

function readsHostedCaCertificateAndEnablesVerification() {
  const ssl = buildHostedDatabaseSslConfig(
    {
      DB_SSL_CA_CERT_PATH: "certs/hosted-db-ca.pem"
    },
    "C:/repo",
    {
      readFileSync(filePath, encoding) {
        assert.equal(filePath, "C:\\repo\\certs\\hosted-db-ca.pem");
        assert.equal(encoding, "utf8");
        return "-----BEGIN CERTIFICATE-----\ntrusted-ca\n-----END CERTIFICATE-----\n";
      }
    }
  );

  assert.deepEqual(ssl, {
    ca: "-----BEGIN CERTIFICATE-----\ntrusted-ca\n-----END CERTIFICATE-----\n",
    rejectUnauthorized: true
  });
}

requiresHostedCaCertificatePath();
readsHostedCaCertificateAndEnablesVerification();

console.log("hosted-ssl-tests: ok");
