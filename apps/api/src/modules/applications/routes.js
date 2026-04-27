import { readJsonBody, sendJson } from "../../lib/http.js";
import { resolveInterviewImportPayload } from "./interviewUpload.js";
import { resolveApplicationImportPayload } from "./upload.js";

export function createApplicationRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/applications/summary",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const summary = await services.applications.summary({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          studentReferenceId: url.searchParams.get("studentReferenceId") || "",
          q: url.searchParams.get("q") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          summary
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const items = await services.applications.list({
          status: url.searchParams.get("status") || "",
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          studentId: url.searchParams.get("studentId") || "",
          studentReferenceId: url.searchParams.get("studentReferenceId") || "",
          q: url.searchParams.get("q") || "",
          qualificationStatus: url.searchParams.get("qualificationStatus") || "",
          nameMismatchOnly: url.searchParams.get("nameMismatchOnly") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          total: items.length,
          items
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/cwa-coverage",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const coverage = await services.applications.cwaCoverage({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          studentReferenceId: url.searchParams.get("studentReferenceId") || "",
          q: url.searchParams.get("q") || "",
          qualificationStatus: url.searchParams.get("qualificationStatus") || "",
          nameMismatchOnly: url.searchParams.get("nameMismatchOnly") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...coverage
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/issues",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const result = await services.applications.listImportIssues({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/messages/settings",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res }) {
        const result = await services.applications.getMessagingSettings();

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/messages/preview",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const result = await services.applications.messagingPreview({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || "",
          messageType: url.searchParams.get("messageType") || "",
          channel: url.searchParams.get("channel") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/messages/history",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const result = await services.applications.listMessageHistory({
          schemeId: url.searchParams.get("schemeId") || "",
          cycleId: url.searchParams.get("cycleId") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
      {
        method: "GET",
        path: "/api/applications/export",
        auth: "required",
        roles: ["admin"],
      async handler({ actor, res, url }) {
        const result = await services.applications.exportList(
          {
            schemeId: url.searchParams.get("schemeId") || "",
            cycleId: url.searchParams.get("cycleId") || "",
            qualificationStatus: url.searchParams.get("qualificationStatus") || "",
            fontName: url.searchParams.get("fontName") || ""
          },
          actor
        );

        res.writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${result.fileName}"`,
          "Content-Length": String(result.buffer.length)
        });
        res.end(result.buffer);
      }
    },
      {
        method: "POST",
        path: "/api/applications/import/preview",
        auth: "required",
        roles: ["admin"],
      async handler({ req, res }) {
        const payload = await resolveApplicationImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.applications.previewImport(payload);

        return sendJson(res, 200, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          schemeId: payload.schemeId,
          cycleId: payload.cycleId,
          importMode: payload.importMode,
          ...result
        });
      }
    },
      {
        method: "POST",
        path: "/api/applications/interview-import/preview",
        auth: "required",
        roles: ["admin"],
      async handler({ req, res }) {
        const payload = await resolveInterviewImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.applications.previewInterviewImport(payload);

        return sendJson(res, 200, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          schemeId: payload.schemeId,
          cycleId: payload.cycleId,
          ...result
        });
      }
    },
      {
        method: "POST",
        path: "/api/applications/import",
        auth: "required",
        roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveApplicationImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.applications.importRows(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          schemeId: payload.schemeId,
          cycleId: payload.cycleId,
          importMode: payload.importMode,
          ...result
        });
      }
    },
      {
        method: "POST",
        path: "/api/applications/interview-import",
        auth: "required",
        roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveInterviewImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.applications.importInterviewRows(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          schemeId: payload.schemeId,
          cycleId: payload.cycleId,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/applications",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.applications.create(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    },
    {
      method: "POST",
      path: "/api/applications/messages/log",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.recordMessageBatch(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/applications/messages/send",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.sendMessageBatch(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/applications/:applicationId/history",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ params, res }) {
        const result = await services.applications.getApplicationHistory(params.applicationId);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "PUT",
      path: "/api/applications/issues/:issueId/resolve",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.resolveImportIssue(params.issueId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "PUT",
      path: "/api/applications/:applicationId/review",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.applications.review(params.applicationId, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "POST",
      path: "/api/applications/:applicationId/academic-history",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.saveAcademicHistoryEntry(
          params.applicationId,
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
      method: "PUT",
      path: "/api/applications/interview-bulk",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.bulkUpdateInterview(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "PUT",
      path: "/api/applications/outcomes/bulk",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.applications.bulkApplyOutcomes(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
