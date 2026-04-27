import { readJsonBody, sendJson } from "../../lib/http.js";
import { resolveRecommendedImportPayload } from "./upload.js";

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
        const payload = await resolveRecommendedImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.waitlist.previewImport(payload);

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
      path: "/api/waitlist/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveRecommendedImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.waitlist.importRows(payload, actor);

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
