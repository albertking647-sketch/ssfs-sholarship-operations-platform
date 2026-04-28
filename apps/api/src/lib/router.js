import { ForbiddenError, UnauthorizedError } from "./errors.js";
import { buildSecurityHeaders } from "./http.js";

function matchPath(template, actualPath) {
  const templateParts = template.split("/").filter(Boolean);
  const actualParts = actualPath.split("/").filter(Boolean);

  if (templateParts.length !== actualParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < templateParts.length; index += 1) {
    const templatePart = templateParts[index];
    const actualPart = actualParts[index];

    if (templatePart.startsWith(":")) {
      params[templatePart.slice(1)] = decodeURIComponent(actualPart);
      continue;
    }

    if (templatePart !== actualPart) {
      return null;
    }
  }

  return params;
}

export function createRouter(routes) {
  return async function routeRequest({ req, res, url, context }) {
    let pathMatched = false;

    for (const route of routes) {
      const params = matchPath(route.path, url.pathname);
      if (!params) {
        continue;
      }

      pathMatched = true;
      if (route.method !== req.method) {
        continue;
      }

      const actor = await context.authService.resolveRequestActor(req);

      if (route.auth === "required" && !actor) {
        throw new UnauthorizedError();
      }

      if (route.roles?.length) {
        if (!actor) {
          throw new UnauthorizedError();
        }

        if (!route.roles.includes(actor.roleCode)) {
          throw new ForbiddenError();
        }
      }

      await route.handler({
        actor,
        context,
        params,
        req,
        res,
        url
      });
      return true;
    }

    if (pathMatched) {
      res.writeHead(405, buildSecurityHeaders({
        "Content-Type": "application/json; charset=utf-8",
        Allow: routes
          .filter((route) => matchPath(route.path, url.pathname))
          .map((route) => route.method)
          .join(", ")
      }));
      res.end(
        JSON.stringify(
          {
            ok: false,
            message: "Method not allowed."
          },
          null,
          2
        )
      );
      return true;
    }

    return false;
  };
}
