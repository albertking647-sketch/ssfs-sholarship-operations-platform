import { AppError, TooManyRequestsError } from "./errors.js";

const DEFAULT_SECURITY_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

export function buildSecurityHeaders(extraHeaders = {}) {
  return {
    ...DEFAULT_SECURITY_HEADERS,
    ...extraHeaders
  };
}

export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, buildSecurityHeaders({
    "Content-Type": "application/json; charset=utf-8"
  }));
  res.end(JSON.stringify(payload, null, 2));
}

export function notFound(res) {
  sendJson(res, 404, {
    ok: false,
    message: "Route not found."
  });
}

export function sendError(res, error) {
  if (error instanceof AppError) {
    if (error instanceof TooManyRequestsError && Number.isFinite(error.retryAfterSeconds)) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
    }

    return sendJson(res, error.statusCode, {
      ok: false,
      message: error.message,
      details: error.details || null
    });
  }

  console.error(error);

  return sendJson(res, 500, {
    ok: false,
    message: "Unexpected server error."
  });
}

export async function readRequestBody(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new AppError(413, "Request body exceeded the configured limit.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }

  return Buffer.concat(chunks);
}

export async function readJsonBody(req, maxBytes) {
  const body = await readRequestBody(req, maxBytes);

  if (body.length === 0) {
    return {};
  }

  try {
    const raw = body.toString("utf8");
    return JSON.parse(raw);
  } catch {
    throw new AppError(400, "Request body must be valid JSON.");
  }
}
