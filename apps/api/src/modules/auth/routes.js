import { readJsonBody, sendJson } from "../../lib/http.js";

export function createAuthRoutes({ authService, config }) {
  return [
    {
      method: "GET",
      path: "/api/auth/session",
      auth: "optional",
      async handler({ actor, res }) {
        return sendJson(res, 200, {
          ok: true,
          authMode: config.auth.mode,
          authenticated: Boolean(actor),
          actor: actor || null
        });
      }
    },
    {
      method: "POST",
      path: "/api/auth/login",
      auth: "optional",
      async handler({ req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const session = await authService.login(payload, {
          remoteAddress: req.socket?.remoteAddress || "",
          forwardedFor: req.headers["x-forwarded-for"] || ""
        });

        return sendJson(res, 200, {
          ok: true,
          authMode: config.auth.mode,
          authenticated: true,
          token: session.token,
          actor: session.actor
        });
      }
    },
    {
      method: "POST",
      path: "/api/auth/logout",
      auth: "required",
      async handler({ req, res }) {
        const result = await authService.logoutRequest(req);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/auth/users",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, res }) {
        const items = await authService.listUsers(actor);

        return sendJson(res, 200, {
          ok: true,
          total: items.length,
          items
        });
      }
    },
    {
      method: "POST",
      path: "/api/auth/users",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await authService.createUser(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    },
    {
      method: "PATCH",
      path: "/api/auth/users/:userId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await authService.updateUser(params.userId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "DELETE",
      path: "/api/auth/users/:userId",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, res }) {
        const result = await authService.deleteUser(params.userId, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/auth/users/:userId/reset-password",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await authService.resetPassword(params.userId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
