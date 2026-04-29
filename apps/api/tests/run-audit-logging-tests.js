import assert from "node:assert/strict";

import { createApplicationCriteriaService } from "../src/modules/applicationCriteria/service.js";
import { createAuthService } from "../src/modules/auth/service.js";
import { hashPassword } from "../src/modules/auth/passwords.js";
import { createFoodBankService } from "../src/modules/foodBank/service.js";
import { createSchemeService } from "../src/modules/schemes/service.js";
import { createWaitlistService } from "../src/modules/waitlist/service.js";

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

function createBaseConfig(overrides = {}) {
  return {
    runtime: {
      mode: "development",
      isDevelopment: true,
      isTest: false,
      isProduction: false
    },
    network: {
      trustedProxies: []
    },
    auth: {
      mode: "password",
      sessionSecret: "audit-session-secret",
      sessionCookieName: "ssfs_session",
      sessionTtlHours: 12,
      loginRateLimit: {
        enabled: true,
        maxAttempts: 5,
        windowMs: 60000,
        blockMs: 60000
      },
      devTokens: [],
      bootstrapAdmin: {
        fullName: "",
        username: "",
        password: ""
      }
    },
    messaging: {
      enabled: false
    },
    ...overrides
  };
}

async function authAdminActionsWriteAuditEntries() {
  const users = [];
  const audit = createAuditRepository();
  const repository = {
    async findUserById(id) {
      return users.find((item) => item.id === String(id)) || null;
    },
    async findUserByUsername(username) {
      return users.find((item) => item.username === username) || null;
    },
    async findUserByEmail(email) {
      return users.find((item) => item.email === email) || null;
    },
    async listUsers() {
      return users.map((item) => ({ ...item }));
    },
    async countActiveAdmins() {
      return users.filter((item) => item.roleCode === "admin" && item.status === "active").length;
    },
    async createUser(input) {
      const created = {
        id: String(users.length + 1),
        fullName: input.fullName,
        username: input.username,
        email: input.email || null,
        passwordHash: input.passwordHash,
        roleCode: input.roleCode,
        status: input.status || "active"
      };
      users.push(created);
      return { ...created };
    },
    async updateUser(userId, input) {
      const target = users.find((item) => item.id === String(userId));
      if (!target) return null;
      Object.assign(target, {
        fullName: input.fullName,
        username: input.username,
        email: input.email || null,
        roleCode: input.roleCode,
        status: input.status || "active"
      });
      return { ...target };
    },
    async setPassword(userId, passwordHash) {
      const target = users.find((item) => item.id === String(userId));
      if (!target) return null;
      target.passwordHash = passwordHash;
      return { ...target };
    },
    async deleteUser(userId) {
      const index = users.findIndex((item) => item.id === String(userId));
      if (index < 0) return null;
      const [deleted] = users.splice(index, 1);
      return deleted;
    }
  };

  const adminPasswordHash = await hashPassword("StrongPass!23");
  users.push({
    id: "1",
    fullName: "Platform Admin",
    username: "admin",
    email: "admin@example.test",
    passwordHash: adminPasswordHash,
    roleCode: "admin",
    status: "active"
  });

  const service = createAuthService({
    config: createBaseConfig(),
    repository: {
      ...repository,
      audit
    },
    users: []
  });
  const actor = {
    userId: "1",
    fullName: "Platform Admin",
    username: "admin",
    roleCode: "admin",
    email: "admin@example.test",
    status: "active"
  };

  const created = await service.createUser(
    {
      fullName: "Second Reviewer",
      username: "reviewer-2",
      password: "ReviewerPass!23",
      roleCode: "reviewer"
    },
    actor
  );
  await service.updateUser(
    created.id,
    {
      fullName: "Second Reviewer Updated"
    },
    actor
  );
  await service.resetPassword(
    created.id,
    {
      password: "UpdatedPass!23"
    },
    actor
  );
  await service.deleteUser(created.id, actor);

  assert.deepEqual(
    audit.events.map((event) => event.actionCode),
    [
      "auth.user.created",
      "auth.user.updated",
      "auth.user.password_reset",
      "auth.user.deleted"
    ]
  );
}

async function schemeAndCriteriaWritesAuditEntries() {
  const audit = createAuditRepository();
  const cycles = [{ id: "cycle-1", academicYearLabel: "2026/2027", label: "2026/2027 Academic Year" }];
  const schemes = [];
  const schemeService = createSchemeService({
    repositories: {
      audit,
      cycles: {
        async getById(id) {
          return cycles.find((item) => item.id === String(id)) || null;
        },
        async list() {
          return cycles;
        }
      },
      schemes: {
        async list() {
          return schemes;
        },
        async findByCode(code) {
          return schemes.find((item) => item.code === code) || null;
        },
        async create(input) {
          const created = { ...input };
          schemes.push(created);
          return created;
        },
        async getById(id) {
          return schemes.find((item) => item.id === String(id)) || null;
        },
        async update(id, input) {
          const target = schemes.find((item) => item.id === String(id));
          if (!target) return null;
          Object.assign(target, input);
          return { ...target };
        },
        async remove(id) {
          const index = schemes.findIndex((item) => item.id === String(id));
          if (index < 0) return null;
          const [removed] = schemes.splice(index, 1);
          return removed;
        }
      }
    }
  });
  const actor = {
    userId: "1",
    fullName: "Platform Admin",
    roleCode: "admin"
  };

  const created = await schemeService.create(
    {
      name: "Merit and Needs Scholarship",
      category: "scholarship",
      cycleId: "cycle-1"
    },
    actor
  );
  await schemeService.update(
    created.id,
    {
      name: "Merit and Needs Scholarship Updated",
      category: "scholarship",
      cycleId: "cycle-1"
    },
    actor
  );
  await schemeService.remove(created.id, actor);

  const criteriaService = createApplicationCriteriaService({
    repositories: {
      audit,
      schemes: {
        async getById() {
          return { id: "scheme-1", name: "Merit Scholarship" };
        }
      },
      cycles: {
        async getById() {
          return { id: "cycle-1", label: "2026/2027 Academic Year" };
        }
      },
      applicationCriteria: {
        async upsert(payload) {
          return { id: "criteria-1", ...payload };
        }
      }
    }
  });

  await criteriaService.upsert(
    {
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      requiredDocuments: ["Admission Letter"]
    },
    actor
  );

  assert.deepEqual(
    audit.events.map((event) => event.actionCode),
    [
      "scheme.created",
      "scheme.updated",
      "scheme.deleted",
      "application_criteria.upserted"
    ]
  );
}

async function supportAndRecommendedFlowsWriteAuditEntries() {
  const audit = createAuditRepository();
  const actor = {
    userId: "1",
    fullName: "Platform Admin",
    roleCode: "admin"
  };
  const foodBankRows = [];
  const foodBankService = createFoodBankService({
    repositories: {
      audit,
      students: {
        async findByIdentifiers() {
          return [{ id: "student-1", fullName: "Akosua Mensah", studentReferenceId: "20261234" }];
        },
        async getById() {
          return {
            id: "student-1",
            fullName: "Akosua Mensah",
            studentReferenceId: "20261234",
            indexNumber: "ENG/24/001",
            email: "akosua@example.test",
            college: "Engineering",
            program: "Computer Engineering",
            year: "Year 2"
          };
        }
      },
      foodBank: {
        async list() {
          return foodBankRows;
        },
        async listFilterOptions() {
          return {};
        },
        async getById(id) {
          const item = foodBankRows.find((row) => row.id === id);
          return item ? { ...item } : null;
        },
        async findExisting() {
          return null;
        },
        async create(input) {
          const created = { id: "fb-1", status: "registered", ...input };
          foodBankRows.push(created);
          return created;
        },
        async update(id, input) {
          return { id, ...foodBankRows[0], ...input };
        },
        async importRows({ items }) {
          return {
            batchReference: "batch-1",
            items: items.map((item, index) => ({ id: `fb-${index + 2}`, ...item }))
          };
        },
        async markServed(id) {
          return { id, ...foodBankRows[0], status: "served" };
        },
        async remove() {
          return { id: "fb-1" };
        }
      }
    }
  });

  await foodBankService.create(
    {
      academicYearLabel: "2026/2027",
      semester: "first semester",
      studentReferenceId: "20261234",
      supportTypes: ["food_support"]
    },
    actor
  );
  await foodBankService.update(
    "fb-1",
    {
      academicYearLabel: "2026/2027",
      semester: "first semester",
      studentReferenceId: "20261234",
      supportTypes: ["food_support"],
      notes: "Updated note"
    },
    actor
  );
  await foodBankService.importRows(
    {
      rows: [
        {
          studentReferenceId: "20261234",
          academicYearLabel: "2026/2027 Academic Year",
          semester: "first semester",
          supportTypes: ["food_support"]
        }
      ],
      fileName: "food-bank.xlsx"
    },
    actor
  );
  await foodBankService.markServed("fb-1", actor);
  await foodBankService.remove("fb-1", actor);

  const waitlistService = createWaitlistService({
    repositories: {
      audit,
      students: {
        async findByIdentifiers() {
          return [{ id: "student-1", fullName: "Akosua Mensah", studentReferenceId: "20261234" }];
        }
      },
      applications: {
        async findExisting() {
          return null;
        }
      },
      schemes: {
        async list() {
          return [{ id: "scheme-1", name: "Merit Scholarship", cycleId: "cycle-1", academicYearLabel: "2026/2027 Academic Year" }];
        }
      },
      cycles: {
        async list() {
          return [{ id: "cycle-1", label: "2026/2027 Academic Year" }];
        }
      },
      waitlist: {
        async list() {
          return [];
        },
        async findExisting() {
          return null;
        },
        async create(input) {
          return { id: "rec-1", ...input, status: "awaiting_support" };
        },
        async getById() {
          return {
            id: "rec-1",
            studentId: "student-1",
            schemeId: "scheme-1",
            cycleId: "cycle-1",
            schemeName: "Merit Scholarship",
            cycleLabel: "2026/2027 Academic Year",
            status: "awaiting_support"
          };
        },
        async update(id, input) {
          return { id, studentId: "student-1", schemeId: "scheme-1", cycleId: "cycle-1", ...input };
        },
        async remove() {},
        async importRows({ items }) {
          return {
            batchReference: "recommended-batch-1",
            items: items.map((item, index) => ({ id: `recommended-${index + 1}`, ...item }))
          };
        },
        async linkApplication({ id, applicationId }) {
          return { id, linkedApplicationId: applicationId };
        },
        async markSupported({ id, beneficiaryId }) {
          return { id, linkedBeneficiaryId: beneficiaryId, status: "supported" };
        }
      },
      beneficiaries: {
        async findExistingDuplicateKeys() {
          return new Set();
        },
        async findCrossScopeDuplicateStudentIds() {
          return new Set();
        },
        async findPriorYearNewBeneficiaryKeys() {
          return new Set();
        },
        async importRows() {
          return {
            items: [{ id: "beneficiary-1", fullName: "Akosua Mensah" }]
          };
        }
      }
    },
    services: {
      applications: {
        async create() {
          return { id: "application-1" };
        }
      }
    }
  });

  await waitlistService.create(
    {
      studentReferenceId: "20261234",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Need-based"
    },
    actor
  );
  await waitlistService.update(
    "rec-1",
    {
      studentReferenceId: "20261234",
      schemeId: "scheme-1",
      cycleId: "cycle-1",
      recommendationReason: "Updated note"
    },
    actor
  );
  await waitlistService.importRows(
    {
      rows: [
        {
          studentReferenceId: "20261234",
          schemeName: "Merit Scholarship",
          academicYearLabel: "2026/2027 Academic Year"
        }
      ],
      fileName: "recommended.xlsx"
    },
    actor
  );
  await waitlistService.handoffToApplication("rec-1", actor);
  await waitlistService.handoffToBeneficiary(
    "rec-1",
    {
      amountPaid: 5000,
      supportType: "internal"
    },
    actor
  );
  await waitlistService.promote(
    "rec-1",
    {
      amountPaid: 5000,
      supportType: "internal",
      notes: "Promoted"
    },
    actor
  );

  const requiredActions = new Set([
    "food_bank.created",
    "food_bank.updated",
    "food_bank.imported",
    "food_bank.served",
    "food_bank.deleted",
    "recommended_student.created",
    "recommended_student.updated",
    "recommended_student.imported",
    "recommended_student.handoff_to_application",
    "recommended_student.handoff_to_beneficiary",
    "recommended_student.promoted"
  ]);

  for (const actionCode of requiredActions) {
    assert.ok(
      audit.events.some((event) => event.actionCode === actionCode),
      `expected audit action ${actionCode}`
    );
  }
}

await authAdminActionsWriteAuditEntries();
await schemeAndCriteriaWritesAuditEntries();
await supportAndRecommendedFlowsWriteAuditEntries();

console.log("audit-logging-tests: ok");
