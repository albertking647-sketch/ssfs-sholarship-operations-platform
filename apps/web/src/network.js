function isLoopbackHostname(value) {
  const hostname = String(value || "").trim().toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function parseUrlHostname(value) {
  try {
    return new URL(String(value || "")).hostname;
  } catch {
    return "";
  }
}

function parseUrlHost(value) {
  try {
    return new URL(String(value || "")).host;
  } catch {
    return "";
  }
}

const SENSITIVE_LOGIN_QUERY_PARAMS = new Set([
  "apiUrl",
  "authToken",
  "loginApiUrl",
  "loginUsername",
  "loginPassword"
]);

export function deriveDefaultApiUrl(locationLike, fallback = "http://127.0.0.1:4400") {
  const protocol = String(locationLike?.protocol || "http:").trim() || "http:";
  const host = String(locationLike?.host || "").trim();
  const hostname = String(locationLike?.hostname || "").trim();
  if (host) {
    return `${protocol}//${host}`;
  }

  if (!hostname) {
    return fallback;
  }

  return `${protocol}//${hostname}`;
}

export function shouldUseStoredApiUrl(storedApiUrl, locationLike) {
  const stored = String(storedApiUrl || "").trim();
  if (!stored) {
    return false;
  }

  const currentHostname = String(locationLike?.hostname || "").trim();
  const currentHost = String(locationLike?.host || "").trim();
  const storedHost = parseUrlHost(stored);
  if (!currentHostname) {
    return true;
  }

  if (!isLoopbackHostname(currentHostname) && isLoopbackHostname(parseUrlHostname(stored))) {
    return false;
  }

  if (currentHost && storedHost && storedHost !== currentHost) {
    return false;
  }

  return true;
}

export function getSanitizedLoginUrl(locationLike) {
  try {
    const source =
      typeof locationLike === "string"
        ? locationLike
        : String(locationLike?.href || "");
    const url = new URL(source);
    let mutated = false;

    for (const key of SENSITIVE_LOGIN_QUERY_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        mutated = true;
      }
    }

    if (!mutated) {
      return "";
    }

    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ""}${url.hash || ""}`;
  } catch {
    return "";
  }
}
