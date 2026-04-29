import { readJsonBody, sendJson } from "../../lib/http.js";

export function createApplicationCriteriaRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/application-criteria",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const item = await services.applicationCriteria.getBySchemeCycle({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "POST",
      path: "/api/application-criteria",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.applicationCriteria.upsert(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    }
  ];
}
