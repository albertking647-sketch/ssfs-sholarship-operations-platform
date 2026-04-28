import { URL } from "node:url";
import { buildCorsHeaders, isOriginAllowed } from "./lib/cors.js";
import { createRouter } from "./lib/router.js";
import { buildSecurityHeaders, notFound, sendError, sendJson } from "./lib/http.js";
import { createApplicationCriteriaRoutes } from "./modules/applicationCriteria/routes.js";
import { createAuthRoutes } from "./modules/auth/routes.js";
import { createApplicationRoutes } from "./modules/applications/routes.js";
import { createBeneficiaryRoutes } from "./modules/beneficiaries/routes.js";
import { createCycleRoutes } from "./modules/cycles/routes.js";
import { createFoodBankRoutes } from "./modules/foodBank/routes.js";
import { createReportRoutes } from "./modules/reports/routes.js";
import { createSchemeRoutes } from "./modules/schemes/routes.js";
import { createStudentRoutes } from "./modules/students/routes.js";
import { createWaitlistRoutes } from "./modules/waitlist/routes.js";

export function createApp(runtime) {
  const router = createRouter([
    ...createAuthRoutes(runtime),
    ...createApplicationCriteriaRoutes(runtime),
    ...createCycleRoutes(runtime),
    ...createSchemeRoutes(runtime),
    ...createStudentRoutes(runtime),
    ...createApplicationRoutes(runtime),
    ...createBeneficiaryRoutes(runtime),
    ...createFoodBankRoutes(runtime),
    ...createWaitlistRoutes(runtime),
    ...createReportRoutes(runtime)
  ]);

  return async function app(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const requestOrigin = req.headers.origin || "";
    if (
      !isOriginAllowed(
        requestOrigin,
        req.headers.host || "",
        runtime.config.cors?.allowedOrigins || [],
        req.headers["x-forwarded-proto"] || "http"
      )
    ) {
      return sendJson(res, 403, {
        ok: false,
        message: "This API does not accept cross-origin requests from that origin."
      });
    }

    for (const [name, value] of Object.entries(buildCorsHeaders(requestOrigin))) {
      res.setHeader(name, value);
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, buildSecurityHeaders());
      res.end();
      return;
    }

    try {
      if (url.pathname === "/health" && req.method === "GET") {
        await runtime.database.healthCheck();
        return sendJson(res, 200, {
          ok: true,
          service: "api",
          status: "healthy"
        });
      }

      if (url.pathname === "/api" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          product: "Scholarship Operations Platform",
          service: "api",
          status: "available"
        });
      }

      const handled = await router({ req, res, url, context: runtime });
      if (!handled) {
        return notFound(res);
      }
    } catch (error) {
      return sendError(res, error);
    }
  };
}
