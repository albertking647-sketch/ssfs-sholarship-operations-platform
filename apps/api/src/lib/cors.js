function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    return new URL(text).origin;
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
}

export function isOriginAllowed(origin, requestHost, allowedOrigins = []) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return !origin;
  }

  const normalizedRequestHost = normalizeHost(requestHost);
  if (normalizedRequestHost && normalizeHost(new URL(normalizedOrigin).host) === normalizedRequestHost) {
    return true;
  }

  return allowedOrigins
    .map((item) => normalizeOrigin(item))
    .filter(Boolean)
    .includes(normalizedOrigin);
}

export function buildCorsHeaders(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": normalizedOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  };
}
