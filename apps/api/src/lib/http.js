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

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProgressEvent(event = {}, type = "progress") {
  const processedRows = Math.max(0, Number(event.processedRows || 0));
  const totalRows = Math.max(0, Number(event.totalRows || 0));
  const percent =
    event.percent !== undefined
      ? clampPercent(Number(event.percent))
      : totalRows > 0
        ? clampPercent((processedRows / totalRows) * 100)
        : type === "complete"
          ? 100
          : 0;

  return {
    type,
    phase: event.phase || (type === "complete" ? "completed" : "importing"),
    processedRows,
    totalRows,
    percent,
    message: event.message || (type === "complete" ? "Import complete." : "Working...")
  };
}

export function formatImportProgressEvent(event = {}) {
  return `${JSON.stringify(normalizeProgressEvent(event, event.type || "progress"))}\n`;
}

export function wantsNdjsonProgress(req) {
  return String(req?.headers?.accept || "")
    .split(",")
    .map((item) => item.split(";")[0].trim().toLowerCase())
    .includes("application/x-ndjson");
}

export function createImportProgressReporter(res) {
  let started = false;
  let closed = false;

  function markClosed() {
    closed = true;
  }

  if (typeof res.on === "function") {
    res.on("close", markClosed);
    res.on("error", markClosed);
  }

  function isClosed() {
    return closed || Boolean(res.writableEnded || res.destroyed);
  }

  function start(statusCode = 200) {
    if (started) return !isClosed();
    if (isClosed()) return false;
    started = true;
    try {
      res.writeHead(statusCode, buildSecurityHeaders({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no"
      }));
      return true;
    } catch {
      markClosed();
      return false;
    }
  }

  function write(event, type = "progress") {
    if (!start()) {
      return false;
    }
    const normalized = normalizeProgressEvent(event, type);
    if (type === "complete" && event.payload !== undefined) {
      normalized.payload = event.payload;
    }
    if (type === "failed" && event.error !== undefined) {
      normalized.error = event.error;
    }
    try {
      res.write(`${JSON.stringify(normalized)}\n`);
      return true;
    } catch {
      markClosed();
      return false;
    }
  }

  function end() {
    if (isClosed()) return;
    try {
      res.end();
    } catch {
      markClosed();
    }
  }

  return {
    start,
    isClosed,
    progress(event) {
      write(event, "progress");
    },
    complete(payload) {
      if (write({ type: "complete", phase: "completed", percent: 100, payload }, "complete")) {
        end();
      }
    },
    fail(error) {
      if (write(
        {
          type: "failed",
          phase: "failed",
          percent: 100,
          message: error?.message || "Import failed.",
          error: {
            message: error?.message || "Import failed."
          }
        },
        "failed"
      )) {
        end();
      }
    }
  };
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
