import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function normalizeLocalApiHost(value) {
  const host = String(value || "").trim();
  if (!host || host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }

  return host;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return !["false", "0", "no"].includes(String(value).trim().toLowerCase());
}

function resolveCandidatePath(candidatePath, rootDir = process.cwd()) {
  const normalized = String(candidatePath || "").trim();
  if (!normalized) {
    return "";
  }

  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(rootDir, normalized);
}

function toPemCertificate(certificateBuffer) {
  const text = certificateBuffer.toString("utf8").trim();
  if (text.startsWith("-----BEGIN CERTIFICATE-----")) {
    return `${text}\n`;
  }

  const certificate = new X509Certificate(certificateBuffer);
  const chunks = certificate.raw.toString("base64").match(/.{1,64}/gu) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join("\n")}\n-----END CERTIFICATE-----\n`;
}

function resolveApiProxyCertificateAuthorityPath(env = {}, tlsConfig = {}, rootDir = process.cwd()) {
  const explicitPath = resolveCandidatePath(env.API_PROXY_CA_PATH, rootDir);
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const pfxPath = resolveCandidatePath(
    tlsConfig.pfxPath || env.TLS_PFX_PATH || env.HTTPS_PFX_PATH,
    rootDir
  );

  if (!pfxPath) {
    return "";
  }

  const siblingCandidates = [
    pfxPath.replace(/\.[^.]+$/u, ".cer"),
    pfxPath.replace(/\.[^.]+$/u, ".crt"),
    pfxPath.replace(/\.[^.]+$/u, ".pem")
  ];

  return siblingCandidates.find((candidate) => fs.existsSync(candidate)) || "";
}

export function shouldProxyToApi(pathname) {
  return String(pathname || "").startsWith("/api/");
}

export function buildApiProxyTarget(env = {}, tlsConfig = {}) {
  const protocol = tlsConfig.enabled ? "https:" : "http:";
  const hostname = normalizeLocalApiHost(env.API_HOST);
  const port = Number(env.API_PORT || 4300);
  return `${protocol}//${hostname}:${port}`;
}

export function buildApiProxyHeaders(requestHeaders = {}, apiProxyTarget) {
  const headers = {
    ...requestHeaders,
    host: apiProxyTarget.host
  };

  delete headers.origin;
  return headers;
}

export function buildApiProxyTlsOptions(env = {}, tlsConfig = {}, rootDir = process.cwd()) {
  const allowInvalidCertificates = parseBoolean(env.API_PROXY_ALLOW_INVALID_CERTS, false);
  if (allowInvalidCertificates) {
    return {
      rejectUnauthorized: false
    };
  }

  const certificateAuthorityPath = resolveApiProxyCertificateAuthorityPath(env, tlsConfig, rootDir);
  if (!tlsConfig.enabled || !certificateAuthorityPath) {
    return {
      rejectUnauthorized: true
    };
  }

  return {
    rejectUnauthorized: true,
    ca: toPemCertificate(fs.readFileSync(certificateAuthorityPath))
  };
}
