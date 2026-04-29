import { readJsonBody, sendJson } from "../../lib/http.js";

export function createSchemeRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/schemes",
      auth: "required",
      roles: ["admin", "reviewer", "auditor"],
      async handler({ res }) {
        const items = await services.schemes.list();

        return sendJson(res, 200, {
          ok: true,
          total: items.length,
          items
        });
      }
    },
    {
      method: "POST",
      path: "/api/schemes",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.schemes.create(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    },
    {
      method: "PUT",
      path: "/api/schemes/:schemeId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res, params }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.schemes.update(params.schemeId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "DELETE",
      path: "/api/schemes/:schemeId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, res }) {
        const result = await services.schemes.remove(params.schemeId, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
