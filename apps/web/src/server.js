import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../../../scripts/load-env.js";
import { HARDENING_HEADERS, buildHeaderMap } from "../../../scripts/httpSecurityHeaders.js";
import {
  buildTrustedNetworkRules,
  getRemoteAddressFromRequest,
  isRemoteAddressAllowed
} from "../../../scripts/networkAccess.js";
import { readTlsConfig } from "../../../scripts/tlsConfig.js";
import {
  buildApiProxyHeaders,
  buildApiProxyTlsOptions,
  buildApiProxyTarget,
  shouldProxyToApi
} from "./apiProxy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(rootDir, "..", "..");
const port = Number(process.env.WEB_PORT || process.env.PORT || 4400);
const host = process.env.WEB_HOST || "127.0.0.1";
const allowedNetworkText = process.env.WEB_TRUSTED_NETWORKS || process.env.TRUSTED_NETWORKS || "";
const trustedNetworkRules = buildTrustedNetworkRules(allowedNetworkText);
const tlsConfig = readTlsConfig(process.env, repoRoot);
const apiProxyTarget = new URL(buildApiProxyTarget(process.env, tlsConfig));
const proxyTlsOptions = buildApiProxyTlsOptions(process.env, tlsConfig, repoRoot);
const hardeningHeaderMap = buildHeaderMap(HARDENING_HEADERS);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function resolveFile(requestPath) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const candidate = path.resolve(rootDir, `.${normalized}`);
  if (!candidate.startsWith(rootDir)) return null;
  return candidate;
}

function proxyApiRequest(req, res, requestUrl) {
  const client = apiProxyTarget.protocol === "https:" ? https : http;
  const proxyRequest = client.request(
    {
      protocol: apiProxyTarget.protocol,
      hostname: apiProxyTarget.hostname,
      port: apiProxyTarget.port,
      method: req.method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: buildApiProxyHeaders(req.headers, apiProxyTarget),
      ...proxyTlsOptions
    },
    (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    }
  );

  proxyRequest.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: false,
        message: "The web app could not reach the local API right now."
      })
    );
  });

  req.pipe(proxyRequest);
}

const createServer = tlsConfig.enabled ? https.createServer : http.createServer;
const server = createServer(tlsConfig.httpsOptions || {}, (req, res) => {
  const remoteAddress = getRemoteAddressFromRequest(req);
  if (!isRemoteAddressAllowed(remoteAddress, trustedNetworkRules)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("This web app is available only from approved local networks.");
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  if (shouldProxyToApi(requestUrl.pathname || "/")) {
    proxyApiRequest(req, res, requestUrl);
    return;
  }

  const filePath = resolveFile(requestUrl.pathname || "/");
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...hardeningHeaderMap
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Scholarship Operations Platform web shell running at ${tlsConfig.protocol}://${host}:${port}`);
  if (trustedNetworkRules.length) {
    console.log(`Web local network allowlist enabled for: ${allowedNetworkText}`);
  }
  if (tlsConfig.enabled) {
    console.log(`Web TLS certificate loaded from: ${tlsConfig.certPath}`);
  }
  console.log(`Web API proxy target: ${apiProxyTarget.href}`);
});
