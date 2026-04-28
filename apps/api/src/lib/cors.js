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

function normalizeRequestOrigin(requestHost, requestProtocol) {
  const host = String(requestHost || "").trim();
  if (!host) {
    return "";
  }

  const normalizedProtocol =
    String(requestProtocol || "")
      .trim()
      .replace(/:$/u, "") || "http";

  try {
    return new URL(`${normalizedProtocol}://${host}`).origin;
  } catch {
    return "";
  }
}

export function isOriginAllowed(origin, requestHost, allowedOrigins = [], requestProtocol = "http") {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return !origin;
  }

  const normalizedRequestOrigin = normalizeRequestOrigin(requestHost, requestProtocol);
  if (normalizedRequestOrigin && normalizedRequestOrigin === normalizedOrigin) {
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
