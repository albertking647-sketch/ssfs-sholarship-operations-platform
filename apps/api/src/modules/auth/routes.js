import { readJsonBody, sendJson } from "../../lib/http.js";
import { isSecureRequest, serializeCookie } from "../../lib/cookies.js";

export function createAuthRoutes({ authService, config }) {
  const authJsonBodyBytes = Number(config.limits?.authJsonBodyBytes) || Number(config.limits?.jsonBodyBytes);
  const sessionCookieName =
    String(config.auth?.sessionCookieName || "ssfs_session").trim() || "ssfs_session";

  function buildSessionCookie(token, req) {
    const maxAgeSeconds = Math.max(
      1,
      Math.floor((Number(config.auth?.sessionTtlHours) || 12) * 60 * 60)
    );
    return serializeCookie(sessionCookieName, token, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: "Strict",
      path: "/",
      maxAgeSeconds
    });
  }

  function buildClearedSessionCookie(req) {
    return serializeCookie(sessionCookieName, "", {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: "Strict",
      path: "/",
      maxAgeSeconds: 0,
      expires: new Date(0)
    });
  }

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
        const payload = await readJsonBody(req, authJsonBodyBytes);
        const session = await authService.login(payload, {
          remoteAddress: req.socket?.remoteAddress || "",
          forwardedFor: req.headers["x-forwarded-for"] || ""
        });
        res.setHeader("Set-Cookie", buildSessionCookie(session.token, req));

        return sendJson(res, 200, {
          ok: true,
          authMode: config.auth.mode,
          authenticated: true,
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
        res.setHeader("Set-Cookie", buildClearedSessionCookie(req));

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
        const payload = await readJsonBody(req, authJsonBodyBytes);
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
        const payload = await readJsonBody(req, authJsonBodyBytes);
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
        const payload = await readJsonBody(req, authJsonBodyBytes);
        const result = await authService.resetPassword(params.userId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
