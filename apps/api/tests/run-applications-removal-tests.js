import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createApp } from "../src/app.js";
import { createApplicationService } from "../src/modules/applications/service.js";

function createAuditRepository() {
  const events = [];
  return {
    events,
    async record(event) {
      events.push(event);
      return event;
    }
  };
}

function createBaseRuntime(overrides = {}) {
  return {
    config: {
      limits: {
        jsonBodyBytes: 1024 * 1024,
        authJsonBodyBytes: 16 * 1024
      },
      cors: {
        allowedOrigins: []
      }
    },
    database: {
      async healthCheck() {
        return { status: "ready" };
      }
    },
    authService: {
      async resolveRequestActor() {
        return {
          userId: "reviewer-1",
          fullName: "Review Officer",
          roleCode: "reviewer"
        };
      }
    },
    services: {
      applications: {
        async list() {
          return [];
        },
        async summary() {
          return {};
        },
        async cwaCoverage() {
          return { summary: {}, missingItems: [] };
        }
      }
    },
    ...overrides
  };
}

async function invokeApp(app, { method, url, headers = {}, body = [] }) {
  const req = Readable.from(body);
  req.method = method;
  req.url = url;
  req.headers = headers;

  const response = {
    statusCode: 200,
    headers: {},
    body: ""
  };

  const res = {
    setHeader(name, value) {
      response.headers[String(name).toLowerCase()] = value;
    },
    writeHead(statusCode, headersObject = {}) {
      response.statusCode = statusCode;
      for (const [name, value] of Object.entries(headersObject)) {
        response.headers[String(name).toLowerCase()] = value;
      }
    },
    end(chunk = "") {
      response.body += chunk ? String(chunk) : "";
    }
  };

  await app(req, res);
  return response;
}

async function removesApplicationAndWritesAuditEvent() {
  const audit = createAuditRepository();
  const removedIds = [];
  const service = createApplicationService({
    repositories: {
      audit,
      applications: {
        async getById(id) {
          return {
            id,
            studentId: "student-1",
            studentName: "Ernest Ackah",
            studentReferenceId: "21770907",
            schemeId: "scheme-1",
            schemeName: "SRC KBN Bursary",
            cycleId: "cycle-1",
            cycleLabel: "2026/2027 Academic Year"
          };
        },
        async remove(id) {
          removedIds.push(id);
          return { id, removed: true };
        }
      }
    }
  });

  const result = await service.remove("application-1", {
    userId: "reviewer-1",
    fullName: "Review Officer",
    roleCode: "reviewer"
  });

  assert.deepEqual(result, { id: "application-1", removed: true });
  assert.deepEqual(removedIds, ["application-1"]);
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].actionCode, "application.deleted");
  assert.equal(audit.events[0].entityId, "application-1");
  assert.equal(audit.events[0].metadata.studentReferenceId, "21770907");
}

async function removesScopedNotReviewedApplicationsAndWritesAuditEvent() {
  const audit = createAuditRepository();
  const removeCalls = [];
  const service = createApplicationService({
    repositories: {
      audit,
      schemes: {
        async getById(id) {
          return id === "scheme-1" ? { id, name: "SRC KBN Bursary" } : null;
        }
      },
      cycles: {
        async getById(id) {
          return id === "cycle-1"
            ? { id, label: "2026/2027 Academic Year", academicYearLabel: "2026/2027 Academic Year" }
            : null;
        }
      },
      applications: {
        async removeNotReviewed(filters) {
          removeCalls.push(filters);
          return {
            deletedCount: 7,
            ids: ["application-1", "application-2", "application-3"]
          };
        }
      }
    }
  });

  const result = await service.removeNotReviewed(
    { schemeId: "scheme-1", cycleId: "cycle-1" },
    {
      userId: "admin-1",
      fullName: "Admin Officer",
      roleCode: "admin"
    }
  );

  assert.deepEqual(removeCalls, [{ schemeId: "scheme-1", cycleId: "cycle-1" }]);
  assert.equal(result.removed, true);
  assert.equal(result.deletedCount, 7);
  assert.equal(result.schemeId, "scheme-1");
  assert.equal(result.cycleId, "cycle-1");
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].actionCode, "applications.not_reviewed_deleted");
  assert.equal(audit.events[0].entityId, "scheme-1:cycle-1");
  assert.equal(audit.events[0].metadata.deletedCount, 7);
}

async function deleteRouteRemovesApplicationForReviewer() {
  const removed = [];
  const app = createApp(
    createBaseRuntime({
      services: {
        applications: {
          async remove(id, actor) {
            removed.push({ id, actorRole: actor.roleCode });
            return { id, removed: true };
          }
        }
      }
    })
  );

  const response = await invokeApp(app, {
    method: "DELETE",
    url: "/api/applications/application-1",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    id: "application-1",
    removed: true
  });
  assert.deepEqual(removed, [{ id: "application-1", actorRole: "reviewer" }]);
}

async function deleteRouteRemovesNotReviewedApplicationsForAdmin() {
  const removed = [];
  const app = createApp(
    createBaseRuntime({
      authService: {
        async resolveRequestActor() {
          return {
            userId: "admin-1",
            fullName: "Admin Officer",
            roleCode: "admin"
          };
        }
      },
      services: {
        applications: {
          async removeNotReviewed(filters, actor) {
            removed.push({ filters, actorRole: actor.roleCode });
            return {
              removed: true,
              deletedCount: 4,
              schemeId: filters.schemeId,
              cycleId: filters.cycleId
            };
          }
        }
      }
    })
  );

  const response = await invokeApp(app, {
    method: "DELETE",
    url: "/api/applications/not-reviewed?schemeId=scheme-1&cycleId=cycle-1",
    headers: {
      host: "127.0.0.1:4300"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    removed: true,
    deletedCount: 4,
    schemeId: "scheme-1",
    cycleId: "cycle-1"
  });
  assert.deepEqual(removed, [
    {
      filters: { schemeId: "scheme-1", cycleId: "cycle-1" },
      actorRole: "admin"
    }
  ]);
}

await removesApplicationAndWritesAuditEvent();
await removesScopedNotReviewedApplicationsAndWritesAuditEvent();
await deleteRouteRemovesApplicationForReviewer();
await deleteRouteRemovesNotReviewedApplicationsForAdmin();

console.log("applications-removal-tests: ok");
