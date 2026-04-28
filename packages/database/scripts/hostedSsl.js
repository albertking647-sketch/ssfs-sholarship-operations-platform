import fs from "node:fs";
import path from "node:path";

export function buildHostedDatabaseSslConfig(
  env = process.env,
  baseDirectory = process.cwd(),
  { readFileSync = fs.readFileSync } = {}
) {
  const configuredPath = String(env.DB_SSL_CA_CERT_PATH || "").trim();
  if (!configuredPath) {
    throw new Error(
      "DB_SSL_CA_CERT_PATH must be set to a trusted CA certificate file before syncing to the hosted database."
    );
  }

  const certificatePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(baseDirectory, configuredPath);

  let ca;
  try {
    ca = readFileSync(certificatePath, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read hosted database CA certificate from ${certificatePath}: ${error.message}`
    );
  }

  if (!String(ca).trim()) {
    throw new Error(`Hosted database CA certificate at ${certificatePath} is empty.`);
  }

  return {
    ca,
    rejectUnauthorized: true
  };
}
