import {
  createImportProgressReporter,
  readJsonBody,
  sendJson,
  wantsNdjsonProgress
} from "../../lib/http.js";
import { resolveFoodBankImportPayload } from "./upload.js";

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

export function createFoodBankRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/food-bank",
      auth: "required",
      roles: ["admin", "reviewer", "auditor"],
      async handler({ res, url }) {
        const result = await services.foodBank.list({
          academicYearLabel: url.searchParams.get("academicYearLabel") || "",
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
      method: "POST",
      path: "/api/food-bank",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.foodBank.create(payload, actor);
        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    },
    {
      method: "PATCH",
      path: "/api/food-bank/:foodBankId",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.foodBank.update(params.foodBankId, payload, actor);
        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "DELETE",
      path: "/api/food-bank/:foodBankId",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, res }) {
        const result = await services.foodBank.remove(params.foodBankId, actor);
        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/food-bank/import/preview",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        return sendImportResponse({
          req,
          res,
          resolvePayload: () => resolveFoodBankImportPayload(req, config.limits.jsonBodyBytes),
          run: (payload, progress) => services.foodBank.previewImport(payload, progress),
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
      path: "/api/food-bank/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        return sendImportResponse({
          req,
          res,
          statusCode: 201,
          resolvePayload: () => resolveFoodBankImportPayload(req, config.limits.jsonBodyBytes),
          run: (payload, progress) => services.foodBank.importRows(payload, actor, progress),
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
      path: "/api/food-bank/:foodBankId/mark-served",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, res }) {
        const item = await services.foodBank.markServed(params.foodBankId, actor);
        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    }
  ];
}
