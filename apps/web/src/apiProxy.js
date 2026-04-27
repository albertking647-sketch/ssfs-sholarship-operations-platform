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

export function shouldProxyToApi(pathname) {
  return String(pathname || "").startsWith("/api/");
}

export function buildApiProxyTarget(env = {}, tlsConfig = {}) {
  const protocol = tlsConfig.enabled ? "https:" : "http:";
  const hostname = normalizeLocalApiHost(env.API_HOST);
  const port = Number(env.API_PORT || 4300);
  return `${protocol}//${hostname}:${port}`;
}

export function buildApiProxyTlsOptions(env = {}) {
  const allowInvalidCertificates = parseBoolean(env.API_PROXY_ALLOW_INVALID_CERTS, false);
  return {
    rejectUnauthorized: !allowInvalidCertificates
  };
}
