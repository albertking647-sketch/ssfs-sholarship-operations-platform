import {
  createImportProgressReporter,
  readJsonBody,
  sendJson,
  wantsNdjsonProgress
} from "../../lib/http.js";
import { resolveRecommendedImportPayload } from "./upload.js";

async function sendImportResponse({ req, res, statusCode = 200, resolvePayload, run, buildResponse }) {
  if (!wantsNdjsonProgress(req)) {
    const payload = await resolvePayload();
    const result = await run(payload);
    return sendJson(res, statusCode, buildResponse(payload, result));
  }

  const reporter = createImportProgressReporter(res);
  try {
    reporter.start();
    reporter.progress({ phase: "uploading", message: "Reading uploaded workbook data..." });
    const payload = await resolvePayload();
    reporter.progress({
      phase: "parsing",
      processedRows: 0,
      totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
      message: "Workbook rows parsed. Preparing import..."
    });
    const result = await run(payload, (event) => reporter.progress(event));
    reporter.complete(buildResponse(payload, result));
    return undefined;
  } catch (error) {
    reporter.fail(error);
    return undefined;
  }
}

export function createWaitlistRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/waitlist",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.waitlist.list({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          status: url.searchParams.get("status") || "",
          q: url.searchParams.get("q") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/waitlist/export",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.waitlist.exportList({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          status: url.searchParams.get("status") || "",
          q: url.searchParams.get("q") || ""
        });

        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${result.fileName}"`,
          "Content-Length": String(result.buffer.length)
        });
        res.end(result.buffer);
      }
    },
    {
      method: "POST",
      path: "/api/waitlist",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.waitlist.create(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    },
    {
      method: "PUT",
      path: "/api/waitlist/:waitlistId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.waitlist.update(params.waitlistId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "DELETE",
      path: "/api/waitlist/:waitlistId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, res }) {
        const result = await services.waitlist.remove(params.waitlistId, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/waitlist/import/preview",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        return sendImportResponse({
          req,
          res,
          resolvePayload: () => resolveRecommendedImportPayload(req, config.limits.jsonBodyBytes),
          run: (payload, progress) => services.waitlist.previewImport(payload, progress),
          buildResponse: (payload, result) => ({
            ok: true,
            source: payload.source,
            fileName: payload.fileName,
            fileType: payload.fileType,
            ...result
          })
        });
      }
    },
    {
      method: "POST",
      path: "/api/waitlist/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        return sendImportResponse({
          req,
          res,
          statusCode: 201,
          resolvePayload: () => resolveRecommendedImportPayload(req, config.limits.jsonBodyBytes),
          run: (payload, progress) => services.waitlist.importRows(payload, actor, progress),
          buildResponse: (payload, result) => ({
            ok: true,
            source: payload.source,
            fileName: payload.fileName,
            fileType: payload.fileType,
            ...result
          })
        });
      }
    },
    {
      method: "POST",
      path: "/api/waitlist/:waitlistId/handoff/application",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, res }) {
        const result = await services.waitlist.handoffToApplication(params.waitlistId, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/waitlist/:waitlistId/handoff/beneficiary",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.waitlist.handoffToBeneficiary(
          params.waitlistId,
          payload,
          actor
        );

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/waitlist/:waitlistId/promote",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.waitlist.promote(params.waitlistId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
