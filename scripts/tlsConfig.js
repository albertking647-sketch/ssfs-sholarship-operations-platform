import fs from "node:fs";
import path from "node:path";

function resolveCandidatePath(candidatePath, rootDir = process.cwd()) {
  const normalized = String(candidatePath || "").trim();
  if (!normalized) {
    return "";
  }

  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(rootDir, normalized);
}

export function readTlsConfig(env = process.env, rootDir = process.cwd()) {
  const certPath = resolveCandidatePath(
    env.TLS_CERT_PATH || env.HTTPS_CERT_PATH || "",
    rootDir
  );
  const keyPath = resolveCandidatePath(
    env.TLS_KEY_PATH || env.HTTPS_KEY_PATH || "",
    rootDir
  );
  const passphrase = String(
    env.TLS_KEY_PASSPHRASE ||
      env.HTTPS_KEY_PASSPHRASE ||
      ""
  );

  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      enabled: true,
      protocol: "https",
      certPath,
      keyPath,
      passphrase,
      httpsOptions: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ...(passphrase ? { passphrase } : {})
      }
    };
  }

  return {
    enabled: false,
    protocol: "http",
    certPath: "",
    keyPath: "",
    passphrase: "",
    httpsOptions: null
  };
}
