import { readJsonBody, sendJson } from "../../lib/http.js";
import { resolveStudentHistoryImportPayload } from "./historyUpload.js";
import { resolveStudentImportPayload } from "./upload.js";

export function createStudentRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/students/stats",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res }) {
        const stats = await services.students.getStats();

        return sendJson(res, 200, {
          ok: true,
          stats
        });
      }
    },
    {
      method: "GET",
      path: "/api/students/search",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const items = await services.students.search({
          q: url.searchParams.get("q") || "",
          studentReferenceId: url.searchParams.get("studentReferenceId") || "",
          indexNumber: url.searchParams.get("indexNumber") || "",
          duplicateFlag: url.searchParams.get("duplicateFlag") || "",
          conflictFlag: url.searchParams.get("conflictFlag") || "",
          flaggedOnly: url.searchParams.get("flaggedOnly") || ""
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
      path: "/api/students/history",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res, url }) {
        const items = await services.students.listAcademicHistory({
          q: url.searchParams.get("q") || "",
          studentId: url.searchParams.get("studentId") || "",
          studentReferenceId: url.searchParams.get("studentReferenceId") || "",
          indexNumber: url.searchParams.get("indexNumber") || "",
          includeProfiles: url.searchParams.get("includeProfiles") || ""
        });
        return sendJson(res, 200, {
          ok: true,
          total: items.length,
          items
        });
      }
    },
    {
      method: "POST",
      path: "/api/students/history/import/preview",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        const payload = await resolveStudentHistoryImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.students.previewAcademicHistoryImport(payload);

        return sendJson(res, 200, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          semesterLabel: payload.semesterLabel,
          academicYearLabel: payload.academicYearLabel,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/students/history/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveStudentHistoryImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.students.importAcademicHistoryRows(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          semesterLabel: payload.semesterLabel,
          academicYearLabel: payload.academicYearLabel,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/students/:studentId",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ params, res }) {
        const item = await services.students.getById(params.studentId);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "POST",
      path: "/api/students/import/preview",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        const payload = await resolveStudentImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.students.previewImport(payload);

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
      path: "/api/students/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveStudentImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.students.importRows(payload, actor);

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
      path: "/api/students/clear",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);

        if (String(payload.confirmation || "").trim().toUpperCase() !== "CLEAR REGISTRY") {
          return sendJson(res, 400, {
            ok: false,
            message: "Confirmation text must be exactly CLEAR REGISTRY."
          });
        }

        const result = await services.students.clearRegistry(actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "PUT",
      path: "/api/students/:studentId/contact",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.students.updateContact(params.studentId, payload);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "POST",
      path: "/api/students",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.students.create(payload);

        return sendJson(res, 201, {
          ok: true,
          item
        });
      }
    }
  ];
}
