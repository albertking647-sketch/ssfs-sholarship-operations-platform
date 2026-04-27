import { readJsonBody, sendJson } from "../../lib/http.js";
import { resolveBeneficiaryImportPayload } from "./upload.js";

export function createBeneficiaryRoutes({ config, services }) {
  return [
    {
      method: "GET",
      path: "/api/beneficiaries",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.beneficiaries.list({
          academicYearLabel: url.searchParams.get("academicYearLabel") || "",
          schemeName: url.searchParams.get("schemeName") || "",
          college: url.searchParams.get("college") || "",
          supportType: url.searchParams.get("supportType") || "",
          importMode: url.searchParams.get("importMode") || "",
          q: url.searchParams.get("q") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/beneficiaries/dashboard",
      auth: "required",
      roles: ["admin"],
      async handler({ res }) {
        const dashboard = await services.beneficiaries.getDashboard();

        return sendJson(res, 200, {
          ok: true,
          dashboard
        });
      }
    },
    {
      method: "POST",
      path: "/api/beneficiaries/import/preview",
      auth: "required",
      roles: ["admin"],
      async handler({ req, res }) {
        const payload = await resolveBeneficiaryImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.beneficiaries.previewImport(payload);

        return sendJson(res, 200, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          importMode: payload.importMode,
          categorizedByCollege: payload.categorizedByCollege,
          beneficiaryCohort: payload.beneficiaryCohort || "",
          defaultCurrency: payload.defaultCurrency || "",
          duplicateStrategy: payload.duplicateStrategy || "skip",
          duplicateRowActions: payload.duplicateRowActions || {},
          allowDuplicates: Boolean(payload.allowDuplicates),
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/beneficiaries/import",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await resolveBeneficiaryImportPayload(req, config.limits.jsonBodyBytes);
        const result = await services.beneficiaries.importRows(payload, actor);

        return sendJson(res, 201, {
          ok: true,
          source: payload.source,
          fileName: payload.fileName,
          fileType: payload.fileType,
          importMode: payload.importMode,
          categorizedByCollege: payload.categorizedByCollege,
          beneficiaryCohort: payload.beneficiaryCohort || "",
          defaultCurrency: payload.defaultCurrency || "",
          duplicateStrategy: payload.duplicateStrategy || "skip",
          duplicateRowActions: payload.duplicateRowActions || {},
          allowDuplicates: Boolean(payload.allowDuplicates),
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/beneficiaries/import-history",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.beneficiaries.getImportHistory({
          academicYearLabel: url.searchParams.get("academicYearLabel") || "",
          schemeName: url.searchParams.get("schemeName") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/beneficiaries/audit",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.beneficiaries.getAuditFeed({
          academicYearLabel: url.searchParams.get("academicYearLabel") || "",
          schemeName: url.searchParams.get("schemeName") || "",
          eventType: url.searchParams.get("eventType") || ""
        });

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/beneficiaries/:id/history",
      auth: "required",
      roles: ["admin"],
      async handler({ params, res }) {
        const result = await services.beneficiaries.getRecordHistory(params.id);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "PATCH",
      path: "/api/beneficiaries/:id",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const item = await services.beneficiaries.updateRecord(params.id, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          item
        });
      }
    },
    {
      method: "DELETE",
      path: "/api/beneficiaries/:id",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, params, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes).catch(() => ({}));
        const result = await services.beneficiaries.deleteRecord(params.id, payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/beneficiaries/rollback",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);
        const result = await services.beneficiaries.rollbackBatch(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "POST",
      path: "/api/beneficiaries/clear",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, req, res }) {
        const payload = await readJsonBody(req, config.limits.jsonBodyBytes);

        if (String(payload.confirmation || "").trim().toUpperCase() !== "CLEAR BENEFICIARY DATA") {
          return sendJson(res, 400, {
            ok: false,
            message: "Confirmation text must be exactly CLEAR BENEFICIARY DATA."
          });
        }

        const result = await services.beneficiaries.clearBySchemeAndYear(payload, actor);

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    }
  ];
}
