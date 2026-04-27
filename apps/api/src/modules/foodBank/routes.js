import { readJsonBody, sendJson } from "../../lib/http.js";
import { resolveFoodBankImportPayload } from "./upload.js";

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
      async handler({ params, res }) {
        const result = await services.foodBank.remove(params.foodBankId);
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
        const payload = await resolveFoodBankImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.foodBank.previewImport(payload);
        return sendJson(res, 200, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/food-bank/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveFoodBankImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.foodBank.importRows(payload, actor);
        return sendJson(res, 201, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          ...result
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
