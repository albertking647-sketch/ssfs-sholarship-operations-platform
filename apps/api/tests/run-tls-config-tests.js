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

function loadsPfxWhenConfigured() {
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

  assert.equal(config.enabled, true);
  assert.equal(config.protocol, "https");
  assert.equal(config.pfxPath, pfxPath);
  assert.equal(config.passphrase, "secret");
  assert.deepEqual(config.httpsOptions.pfx, Buffer.from("tls-test"));

  fs.rmSync(tempDir, { recursive: true, force: true });
}

returnsHttpWhenNoCertificateExists();
loadsPfxWhenConfigured();

console.log("tls-config-tests: ok");
