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
  const pfxPath = resolveCandidatePath(
    env.TLS_PFX_PATH || env.HTTPS_PFX_PATH || "",
    rootDir
  );
  const passphrase = String(
    env.TLS_PFX_PASSPHRASE || env.HTTPS_PFX_PASSPHRASE || ""
  );

  if (!pfxPath || !fs.existsSync(pfxPath)) {
    return {
      enabled: false,
      protocol: "http",
      pfxPath: "",
      passphrase: "",
      httpsOptions: null
    };
  }

  return {
    enabled: true,
    protocol: "https",
    pfxPath,
    passphrase,
    httpsOptions: {
      pfx: fs.readFileSync(pfxPath),
      passphrase
    }
  };
}
