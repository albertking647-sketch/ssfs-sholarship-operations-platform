import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createRuntime } from "./bootstrap/createRuntime.js";
import { config } from "./config.js";
import {
  buildTrustedNetworkRules,
  enforceTrustedNetworkAccess
} from "../../../scripts/networkAccess.js";
import { readTlsConfig } from "../../../scripts/tlsConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const runtime = await createRuntime(config);
const app = createApp(runtime);
const trustedNetworkRules = buildTrustedNetworkRules(runtime.config.network?.trustedNetworks || []);
const tlsConfig = readTlsConfig(process.env, repoRoot);
const createServer = tlsConfig.enabled ? https.createServer : http.createServer;
const server = createServer(tlsConfig.httpsOptions || {}, (req, res) => {
  const access = enforceTrustedNetworkAccess(req, res, trustedNetworkRules);
  if (!access.allowed) {
    return;
  }

  return app(req, res);
});

server.listen(config.port, config.host, () => {
  console.log(
    `${config.appName} running at ${tlsConfig.protocol}://${config.host}:${config.port} using ${runtime.dataSource} data source`
  );
  if (trustedNetworkRules.length) {
    console.log(
      `API local network allowlist enabled for: ${runtime.config.network.trustedNetworks.join(", ")}`
    );
  }
  if (tlsConfig.enabled) {
    console.log(`API TLS certificate loaded from: ${tlsConfig.certPath}`);
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Closing API resources...`);
  await runtime.database.close();

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
