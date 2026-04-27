import { sendJson } from "../../lib/http.js";

export function createCycleRoutes({ services }) {
  return [
    {
      method: "GET",
      path: "/api/cycles",
      auth: "optional",
      async handler({ res }) {
        const items = await services.cycles.list();

        return sendJson(res, 200, {
          ok: true,
          total: items.length,
          items
        });
      }
    }
  ];
}
