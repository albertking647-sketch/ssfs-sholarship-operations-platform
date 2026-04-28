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

export function isOriginAllowed(origin, _requestHost, allowedOrigins = []) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return !origin;
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
