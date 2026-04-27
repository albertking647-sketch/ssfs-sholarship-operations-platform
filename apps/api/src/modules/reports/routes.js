import { sendJson } from "../../lib/http.js";

export function createReportRoutes({ services }) {
  return [
    {
      method: "GET",
      path: "/api/reports/dashboard",
      auth: "required",
      roles: ["admin", "reviewer"],
      async handler({ res }) {
        const dashboard = await services.reports.getDashboard();

        return sendJson(res, 200, {
          ok: true,
          dashboard
        });
      }
    },
    {
      method: "GET",
      path: "/api/reports/overview",
      auth: "required",
      roles: ["admin"],
      async handler({ res }) {
        const summary = await services.reports.getOverview();

        return sendJson(res, 200, {
          ok: true,
          summary
        });
      }
    },
    {
      method: "GET",
      path: "/api/reports/beneficiaries/summary",
      auth: "required",
      roles: ["admin"],
      async handler({ res }) {
        const result = await services.reports.getBeneficiarySummaryReport();

        return sendJson(res, 200, {
          ok: true,
          ...result
        });
      }
    },
    {
      method: "GET",
      path: "/api/reports/beneficiaries/summary-export",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, res }) {
        const result = await services.reports.exportBeneficiarySummaryReport(actor);

        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${result.fileName}"`
        });
        res.end(result.buffer);
      }
    },
    {
      method: "GET",
      path: "/api/reports/beneficiaries/scheme",
      auth: "required",
      roles: ["admin"],
      async handler({ res, url }) {
        const result = await services.reports.getBeneficiarySchemeReport({
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
      path: "/api/reports/beneficiaries/export",
      auth: "required",
      roles: ["admin"],
      async handler({ actor, res, url }) {
        const result = await services.reports.exportBeneficiarySchemeReport(
          {
            academicYearLabel: url.searchParams.get("academicYearLabel") || "",
            schemeName: url.searchParams.get("schemeName") || ""
          },
          actor
        );

        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${result.fileName}"`
        });
        res.end(result.buffer);
      }
    }
  ];
}
