import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readTlsConfig } from "../../../scripts/tlsConfig.js";

function returnsHttpWhenNoCertificateExists() {
  const config = readTlsConfig({}, process.cwd());

  assert.equal(config.enabled, false);
  assert.equal(config.protocol, "http");
  assert.equal(config.httpsOptions, null);
}

function loadsPemCertificateAndKeyWhenConfigured() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssfs-tls-"));
  const certPath = path.join(tempDir, "local.pem");
  const keyPath = path.join(tempDir, "local-key.pem");
  fs.writeFileSync(certPath, Buffer.from("tls-cert"));
  fs.writeFileSync(keyPath, Buffer.from("tls-key"));

  const config = readTlsConfig(
    {
      TLS_CERT_PATH: certPath,
      TLS_KEY_PATH: keyPath,
      TLS_KEY_PASSPHRASE: "secret"
    },
    process.cwd()
  );

  assert.equal(config.enabled, true);
  assert.equal(config.protocol, "https");
  assert.equal(config.certPath, certPath);
  assert.equal(config.keyPath, keyPath);
  assert.equal(config.passphrase, "secret");
  assert.deepEqual(config.httpsOptions.cert, Buffer.from("tls-cert"));
  assert.deepEqual(config.httpsOptions.key, Buffer.from("tls-key"));
  assert.equal(config.httpsOptions.passphrase, "secret");

  fs.rmSync(tempDir, { recursive: true, force: true });
}

function ignoresLegacyPfxConfiguration() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssfs-tls-"));
  const pfxPath = path.join(tempDir, "local.pfx");
  fs.writeFileSync(pfxPath, Buffer.from("tls-test"));

  const config = readTlsConfig(
    {
      TLS_PFX_PATH: pfxPath,
      TLS_PFX_PASSPHRASE: "secret"
    },
    process.cwd()
  );

  assert.equal(config.enabled, false);
  assert.equal(config.protocol, "http");
  assert.equal(config.certPath, "");
  assert.equal(config.keyPath, "");
  assert.equal(config.httpsOptions, null);

  fs.rmSync(tempDir, { recursive: true, force: true });
}

returnsHttpWhenNoCertificateExists();
loadsPemCertificateAndKeyWhenConfigured();
ignoresLegacyPfxConfiguration();

console.log("tls-config-tests: ok");
