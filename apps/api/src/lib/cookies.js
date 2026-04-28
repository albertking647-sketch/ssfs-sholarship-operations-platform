function normalizeCookieValue(value) {
  return encodeURIComponent(String(value || ""));
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  const parts = String(cookieHeader || "").split(";");
  for (const part of parts) {
    const [rawName, ...rawValueParts] = part.split("=");
    const name = String(rawName || "").trim();
    if (!name) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    try {
      cookies[name] = decodeURIComponent(String(rawValue || "").trim());
    } catch {
      cookies[name] = String(rawValue || "").trim();
    }
  }

  return cookies;
}

export function readCookie(cookieHeader, name) {
  return parseCookies(cookieHeader)[String(name || "").trim()] || "";
}

export function isSecureRequest(req) {
  if (req?.socket?.encrypted) {
    return true;
  }

  return String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase() === "https";
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${String(name || "").trim()}=${normalizeCookieValue(value)}`];

  const path = String(options.path || "/").trim() || "/";
  parts.push(`Path=${path}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure !== false) {
    parts.push("Secure");
  }

  const sameSite = String(options.sameSite || "Strict").trim();
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  if (Number.isFinite(options.maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }

  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}
