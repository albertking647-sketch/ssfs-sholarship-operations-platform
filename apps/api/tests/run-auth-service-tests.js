import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../src/bootstrap/createRuntime.js";
import {
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError
} from "../src/lib/errors.js";
import { canRoleAccessModule } from "../src/modules/auth/roleAccess.js";
import { createAuthService } from "../src/modules/auth/service.js";
import {
  generateSessionToken,
  hashPassword,
  verifyPassword
} from "../src/modules/auth/passwords.js";
import { createAuthRepository } from "../src/modules/auth/repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_DEV_TOKENS = [
  {
    token: "admin-demo-token",
    userId: "user-admin",
    username: "admin",
    email: "admin@example.test",
    fullName: "Platform Admin",
    roleCode: "admin"
  },
  {
    token: "reviewer-demo-token",
    userId: "user-reviewer",
    username: "reviewer",
    email: "reviewer@example.test",
    fullName: "Application Reviewer",
    roleCode: "reviewer"
  },
  {
    token: "auditor-demo-token",
    userId: "user-auditor",
    username: "auditor",
    email: "auditor@example.test",
    fullName: "Audit Officer",
    roleCode: "auditor"
  }
];

function createMockAuthDatabase({ users = [], roles = [] } = {}) {
  const state = {
    roles: roles.map((role, index) => ({
      id: role.id ?? index + 1,
      code: role.code,
      name: role.name,
      description: role.description ?? null
    })),
    users: users.map((user, index) => ({
      id: user.id ?? index + 1,
      roleCode: user.roleCode,
      fullName: user.fullName,
      username: user.username ?? null,
      email: user.email ?? null,
      passwordHash: user.passwordHash ?? "existing-hash",
      isActive: user.isActive ?? true,
      createdAtOrder: index
    }))
  };

  return {
    enabled: true,
    state,
    async query(text, params = []) {
      const sql = String(text).replace(/\s+/g, " ").trim();

      if (sql.startsWith("INSERT INTO roles (code, name, description)")) {
        const [code, name, description] = params;
        const existing = state.roles.find((role) => role.code === code);
        if (existing) {
          existing.name = name;
          existing.description = description;
          return { rows: [] };
        }

        state.roles.push({
          id: state.roles.length + 1,
          code,
          name,
          description
        });
        return { rows: [] };
      }

      if (sql.startsWith("SELECT COUNT(*)::INT AS total FROM users")) {
        let rows = state.users;
        if (sql.includes("INNER JOIN roles")) {
          rows = state.users.filter((user) => user.roleCode === "admin" && user.isActive);
        } else if (sql.includes("WHERE username IS NOT NULL")) {
          rows = state.users.filter((user) => user.username !== null);
        }
        return { rows: [{ total: rows.length }] };
      }

      if (sql.includes("FROM users u INNER JOIN roles r ON r.id = u.role_id")) {
        let rows = state.users.map((user) => ({
          id: String(user.id),
          full_name: user.fullName,
          username: user.username,
          email: user.email,
          password_hash: user.passwordHash,
          is_active: user.isActive,
          role_code: user.roleCode,
          created_at_order: user.createdAtOrder
        }));

        if (sql.includes("WHERE u.username = $1")) {
          rows = rows.filter((row) => row.username === String(params[0] || "").trim());
        } else if (sql.includes("WHERE u.email = $1")) {
          rows = rows.filter((row) => row.email === String(params[0] || "").trim());
        } else if (sql.includes("WHERE u.id = $1::BIGINT")) {
          rows = rows.filter((row) => row.id === String(params[0] || "").trim());
        } else if (sql.includes("WHERE u.username IS NOT NULL")) {
          rows = rows.filter((row) => row.username !== null);
        }

        rows.sort((left, right) => Number(left.created_at_order) - Number(right.created_at_order));
        return { rows: sql.includes("LIMIT 1") ? rows.slice(0, 1) : rows };
      }

      if (sql.startsWith("UPDATE users AS u SET")) {
        const [userId, roleCode, fullName, username, email, isActive] = params;
        const row = state.users.find((item) => String(item.id) === String(userId));
        if (!row || !state.roles.some((role) => role.code === roleCode)) {
          return { rows: [] };
        }

        row.roleCode = roleCode;
        row.fullName = fullName;
        row.username = username;
        row.email = email || null;
        row.isActive = Boolean(isActive);

        return {
          rows: [
            {
              id: String(row.id),
              full_name: row.fullName,
              username: row.username,
              email: row.email,
              password_hash: row.passwordHash,
              is_active: row.isActive,
              role_code: row.roleCode
            }
          ]
        };
      }

      if (sql.startsWith("UPDATE users SET")) {
        const [userId, passwordHash] = params;
        const row = state.users.find((item) => String(item.id) === String(userId));
        if (!row) {
          return { rows: [] };
        }

        row.passwordHash = passwordHash;

        return {
          rows: [
            {
              id: String(row.id),
              full_name: row.fullName,
              username: row.username,
              email: row.email,
              password_hash: row.passwordHash,
              is_active: row.isActive,
              role_code: row.roleCode
            }
          ]
        };
      }

      if (sql.startsWith("INSERT INTO users (")) {
        const [roleCode, fullName, username, email, passwordHash, isActive] = params;
        const role = state.roles.find((item) => item.code === roleCode);
        if (!role) {
          return { rows: [] };
        }

        const row = {
          id: state.users.length + 1,
          roleCode,
          fullName,
          username,
          email: email || null,
          passwordHash,
          isActive: Boolean(isActive),
          createdAtOrder: state.users.length
        };
        state.users.push(row);

        return {
          rows: [
            {
              id: String(row.id),
              full_name: row.fullName,
              username: row.username,
              email: row.email,
              password_hash: row.passwordHash,
              is_active: row.isActive,
              role_code: row.roleCode
            }
          ]
        };
      }

      if (sql.startsWith("DELETE FROM users")) {
        const userId = String(params[0] || "");
        const index = state.users.findIndex((item) => String(item.id) === userId);
        if (index < 0) {
          return { rows: [] };
        }

        const [row] = state.users.splice(index, 1);
        return {
          rows: [
            {
              id: String(row.id),
              full_name: row.fullName,
              username: row.username,
              email: row.email,
              password_hash: row.passwordHash,
              is_active: row.isActive,
              role_code: row.roleCode
            }
          ]
        };
      }

      throw new Error(`Unhandled mock auth query: ${sql}`);
    }
  };
}

function createBaseConfig(overrides = {}) {
  const authOverrides = overrides.auth || {};
  const bootstrapAdminOverrides = authOverrides.bootstrapAdmin || {};
  const databaseOverrides = overrides.database || {};
  const messagingOverrides = overrides.messaging || {};

  return {
    database: {
      enabled: false,
      url: "",
      sslMode: "disable",
      ...databaseOverrides
    },
    auth: {
      mode: "dev-token",
      requiredForWrite: true,
      sessionSecret: "test-session-secret",
      loginRateLimit: {
        enabled: true,
        maxAttempts: 5,
        windowMs: 10 * 60 * 1000,
        blockMs: 15 * 60 * 1000
      },
      devTokens: [],
      bootstrapAdmin: {
        fullName: "",
        username: "",
        password: ""
      },
      ...authOverrides,
      bootstrapAdmin: {
        fullName: "",
        username: "",
        password: "",
        ...bootstrapAdminOverrides
      }
    },
    messaging: {
      enabled: false,
      ...messagingOverrides
    }
  };
}

async function passwordHashingDoesNotStoreRawPassword() {
  const password = "ScholarPass!2026";
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.match(passwordHash, /^pbkdf2\$/);
  assert.doesNotMatch(passwordHash, new RegExp(password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function verifyPasswordAcceptsCorrectPassword() {
  const passwordHash = await hashPassword("CorrectHorseBatteryStaple!");

  const isValid = await verifyPassword("CorrectHorseBatteryStaple!", passwordHash);

  assert.equal(isValid, true);
}

async function verifyPasswordRejectsWrongPassword() {
  const passwordHash = await hashPassword("CorrectHorseBatteryStaple!");

  const isValid = await verifyPassword("wrong-password", passwordHash);

  assert.equal(isValid, false);
}

async function verifyPasswordRejectsMalformedHashes() {
  const password = "CorrectHorseBatteryStaple!";
  const passwordHash = await hashPassword(password);
  const [scheme, iterations, saltHex, derivedKeyHex] = passwordHash.split("$");
  const malformedHash = `${scheme}$${iterations}$${saltHex}$${derivedKeyHex.slice(0, -2)}`;

  const isValid = await verifyPassword(password, malformedHash);

  assert.equal(isValid, false);
}

function generatedSessionTokensLookOpaque() {
  const firstToken = generateSessionToken();
  const secondToken = generateSessionToken();

  assert.equal(typeof firstToken, "string");
  assert.match(firstToken, /^[a-f0-9]{64}$/i);
  assert.notEqual(firstToken, secondToken);
}

async function bootstrapAdminIsCreatedWhenRepositoryIsEmpty() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  const created = await service.ensureBootstrapAdmin();
  const users = await repository.listUsers();

  assert.equal(users.length, 1);
  assert.equal(created?.username, "admin");
  assert.equal(users[0].fullName, "Platform Admin");
  assert.equal(users[0].roleCode, "admin");
  assert.equal(users[0].status, "active");
  assert.notEqual(users[0].passwordHash, "StrongPass!23");
}

async function bootstrapAdminIsNotRecreatedOnSecondRun() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  await service.ensureBootstrapAdmin();
  const usersAfterFirstRun = await repository.listUsers();
  await service.ensureBootstrapAdmin();
  const usersAfterSecondRun = await repository.listUsers();

  assert.equal(usersAfterFirstRun.length, 1);
  assert.equal(usersAfterSecondRun.length, 1);
  assert.equal(usersAfterSecondRun[0].username, "admin");
}

async function bootstrapAdminIsSkippedWhenConfigIsIncomplete() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "",
          password: ""
        }
      }
    }),
    repository,
    users: []
  });

  const created = await service.ensureBootstrapAdmin();
  const users = await repository.listUsers();

  assert.equal(created, null);
  assert.equal(users.length, 0);
}

async function bootstrapAdminIsCreatedWhenLegacyStaffUsersAlreadyExist() {
  const database = createMockAuthDatabase({
    users: [
      {
        id: 77,
        roleCode: "admin",
        fullName: "Legacy Admin",
        username: null,
        email: "legacy.admin@example.test"
      }
    ]
  });
  const repository = createAuthRepository({ database });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  const created = await service.ensureBootstrapAdmin();

  assert.equal(created?.username, "admin");
  assert.equal(await repository.countUsers(), 2);
  assert.equal((await repository.listUsers()).length, 2);
}

async function runtimeBootstrapSeedsRolesAndCreatesAdminInDatabaseMode() {
  const database = createMockAuthDatabase();
  const runtime = await createRuntime(
    createBaseConfig({
      database: {
        enabled: true,
        url: "postgres://example.test/mock",
        sslMode: "disable"
      },
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [
          {
            token: "admin-demo-token",
            userId: "legacy-admin",
            username: "admin",
            fullName: "Platform Admin",
            roleCode: "admin"
          }
        ],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    {
      database,
      users: []
    }
  );

  const createdUsers = await runtime.repositories.auth.listUsers();

  assert.equal(database.state.roles.length, 3);
  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].username, "admin");
}

async function loginAndAdminUserManagementWork() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "password",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  await service.ensureBootstrapAdmin();
  const login = await service.login({ username: "admin", password: "StrongPass!23" });
  assert.ok(login.token);
  assert.equal(login.actor.roleCode, "admin");
  assert.equal(login.actor.username, "admin");

  const actor = await service.resolveRequestActor({
    headers: {
      authorization: `Bearer ${login.token}`
    }
  });
  assert.equal(actor?.userId, login.actor.userId);

  const reviewer = await service.createUser(
    {
      fullName: "Jane Review",
      username: "jreview",
      password: "ReviewPass!23",
      roleCode: "reviewer"
    },
    login.actor
  );
  assert.equal(reviewer.roleCode, "reviewer");
  assert.equal(reviewer.username, "jreview");

  await assert.rejects(
    () => service.createUser(
      {
        fullName: "Another Review",
        username: "jreview",
        password: "AnotherPass!23",
        roleCode: "reviewer"
      },
      login.actor
    ),
    ConflictError
  );

  const updatedReviewer = await service.updateUser(
    reviewer.id,
    {
      fullName: "Jane Senior Review",
      status: "inactive"
    },
    login.actor
  );
  assert.equal(updatedReviewer.fullName, "Jane Senior Review");
  assert.equal(updatedReviewer.status, "inactive");

  await assert.rejects(
    () => service.login({ username: "jreview", password: "ReviewPass!23" }),
    UnauthorizedError
  );

  await service.updateUser(
    reviewer.id,
    {
      status: "active"
    },
    login.actor
  );

  const reset = await service.resetPassword(
    reviewer.id,
    {
      password: "ResetPass!45"
    },
    login.actor
  );
  assert.equal(reset.updated, true);

  await assert.rejects(
    () => service.login({ username: "jreview", password: "ReviewPass!23" }),
    UnauthorizedError
  );

  const reviewerLogin = await service.login({ username: "jreview", password: "ResetPass!45" });
  assert.equal(reviewerLogin.actor.roleCode, "reviewer");

  const deletedReviewer = await service.deleteUser(reviewer.id, login.actor);
  assert.equal(deletedReviewer.deleted, true);

  await assert.rejects(
    () => service.login({ username: "jreview", password: "ResetPass!45" }),
    UnauthorizedError
  );

  const logoutResult = await service.logoutRequest({
    headers: {
      authorization: `Bearer ${reviewerLogin.token}`
    }
  });
  assert.equal(logoutResult.loggedOut, false);

  await assert.rejects(
    () => service.resolveRequestActor({
      headers: {
        authorization: `Bearer ${reviewerLogin.token}`
      }
    }),
    UnauthorizedError
  );
}

async function passwordModeRejectsConfiguredDevTokens() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "password",
        requiredForWrite: true,
        devTokens: [
          {
            token: "admin-demo-token",
            userId: "user-admin",
            username: "admin",
            fullName: "Platform Admin",
            roleCode: "admin"
          }
        ],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  await assert.rejects(
    () =>
      service.resolveRequestActor({
        headers: {
          authorization: "Bearer admin-demo-token"
        }
      }),
    UnauthorizedError
  );
}

function passwordModeRequiresSessionSecret() {
  assert.throws(
    () =>
      createAuthService({
        config: createBaseConfig({
          auth: {
            mode: "password",
            requiredForWrite: true,
            sessionSecret: "",
            devTokens: [],
            bootstrapAdmin: {
              fullName: "Platform Admin",
              username: "admin",
              password: "StrongPass!23"
            }
          }
        }),
        repository: createAuthRepository({ database: { enabled: false } }),
        users: []
      }),
    /AUTH_SESSION_SECRET/i
  );
}

async function repeatedFailedLoginsAreRateLimited() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const clockState = {
    now: 1_000
  };
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "password",
        requiredForWrite: true,
        sessionSecret: "rate-limit-secret",
        loginRateLimit: {
          enabled: true,
          maxAttempts: 3,
          windowMs: 60_000,
          blockMs: 120_000
        },
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: [],
    clock: {
      now() {
        return clockState.now;
      }
    }
  });

  await service.ensureBootstrapAdmin();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(
      () =>
        service.login(
          {
            username: "admin",
            password: "wrong-password"
          },
          {
            remoteAddress: "203.0.113.10"
          }
        ),
      UnauthorizedError
    );
  }

  await assert.rejects(
    () =>
      service.login(
        {
          username: "admin",
          password: "StrongPass!23"
        },
        {
          remoteAddress: "203.0.113.10"
        }
      ),
    TooManyRequestsError
  );

  clockState.now += 121_000;

  const login = await service.login(
    {
      username: "admin",
      password: "StrongPass!23"
    },
    {
      remoteAddress: "203.0.113.10"
    }
  );

  assert.equal(login.actor.username, "admin");
}

async function passwordSessionsSurviveFreshServiceInstances() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const config = createBaseConfig({
    auth: {
      mode: "password",
      requiredForWrite: true,
      devTokens: [],
      bootstrapAdmin: {
        fullName: "Platform Admin",
        username: "admin",
        password: "StrongPass!23"
      }
    }
  });
  const firstService = createAuthService({
    config,
    repository,
    users: []
  });

  await firstService.ensureBootstrapAdmin();
  const login = await firstService.login({ username: "admin", password: "StrongPass!23" });

  const secondService = createAuthService({
    config,
    repository,
    users: []
  });

  const actor = await secondService.resolveRequestActor({
    headers: {
      authorization: `Bearer ${login.token}`
    }
  });

  assert.equal(actor?.username, "admin");
  assert.equal(actor?.roleCode, "admin");
}

async function passwordResetInvalidatesExistingSessionTokensAcrossServiceInstances() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const config = createBaseConfig({
    auth: {
      mode: "password",
      requiredForWrite: true,
      devTokens: [],
      bootstrapAdmin: {
        fullName: "Platform Admin",
        username: "admin",
        password: "StrongPass!23"
      }
    }
  });
  const firstService = createAuthService({
    config,
    repository,
    users: []
  });

  await firstService.ensureBootstrapAdmin();
  const login = await firstService.login({ username: "admin", password: "StrongPass!23" });

  await firstService.resetPassword(
    "1",
    {
      password: "EvenStrongerPass!24"
    },
    login.actor
  );

  const secondService = createAuthService({
    config,
    repository,
    users: []
  });

  await assert.rejects(
    () =>
      secondService.resolveRequestActor({
        headers: {
          authorization: `Bearer ${login.token}`
        }
      }),
    UnauthorizedError
  );
}

async function lastActiveAdminCannotBeDeletedOrDemoted() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const passwordHash = await hashPassword("StrongPass!23");
  await repository.createUser({
    fullName: "Platform Admin",
    username: "admin",
    email: null,
    passwordHash,
    roleCode: "admin",
    status: "active"
  });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "password",
        requiredForWrite: true,
        devTokens: [],
        bootstrapAdmin: {
          fullName: "",
          username: "",
          password: ""
        }
      }
    }),
    repository,
    users: []
  });

  const login = await service.login({ username: "admin", password: "StrongPass!23" });
  const bootstrapAdmin = (await repository.listUsers())[0];

  await assert.rejects(
    () => service.deleteUser(bootstrapAdmin.id, login.actor),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /last active admin/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      service.updateUser(
        bootstrapAdmin.id,
        {
          roleCode: "reviewer"
        },
        login.actor
      ),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /last active admin/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      service.updateUser(
        bootstrapAdmin.id,
        {
          status: "inactive"
        },
        login.actor
      ),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /last active admin/i);
      return true;
    }
  );
}

async function protectedBootstrapAdminCannotBeRenamedDemotedDeactivatedOrDeleted() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: createBaseConfig({
      auth: {
        mode: "password",
        requiredForWrite: true,
        sessionSecret: "protected-admin-secret",
        devTokens: [],
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    }),
    repository,
    users: []
  });

  await service.ensureBootstrapAdmin();
  const login = await service.login({ username: "admin", password: "StrongPass!23" });
  const reviewerAdmin = await service.createUser(
    {
      fullName: "Second Admin",
      username: "second-admin",
      password: "SecondPass!23",
      roleCode: "admin"
    },
    login.actor
  );

  const listedUsers = await service.listUsers(login.actor);
  const protectedAdmin = listedUsers.find((item) => item.username === "admin");
  assert.equal(protectedAdmin?.isProtectedAdmin, true);

  await assert.rejects(
    () =>
      service.updateUser(
        protectedAdmin.id,
        {
          username: "renamed-admin"
        },
        login.actor
      ),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /protected admin/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      service.updateUser(
        protectedAdmin.id,
        {
          roleCode: "reviewer"
        },
        login.actor
      ),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /protected admin/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      service.updateUser(
        protectedAdmin.id,
        {
          status: "inactive"
        },
        login.actor
      ),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /protected admin/i);
      return true;
    }
  );

  await assert.rejects(
    () => service.deleteUser(protectedAdmin.id, login.actor),
    (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /protected admin/i);
      return true;
    }
  );

  assert.equal(reviewerAdmin.roleCode, "admin");
}

function reviewerCannotAccessRestrictedModules() {
  assert.equal(canRoleAccessModule("reviewer", "dashboard"), true);
  assert.equal(canRoleAccessModule("reviewer", "applications"), true);
  assert.equal(canRoleAccessModule("reviewer", "support"), true);
  assert.equal(canRoleAccessModule("reviewer", "registry"), false);
  assert.equal(canRoleAccessModule("reviewer", "waitlist"), false);
  assert.equal(canRoleAccessModule("reviewer", "awards"), false);
  assert.equal(canRoleAccessModule("reviewer", "reports"), false);
}

async function defaultPostgresDevTokenStartupCreatesDatabaseUsersForAllShippedTokens() {
  const database = createMockAuthDatabase();
  const runtime = await createRuntime(
    createBaseConfig({
      database: {
        enabled: true,
        url: "postgres://example.test/mock",
        sslMode: "disable"
      },
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: DEFAULT_DEV_TOKENS,
        bootstrapAdmin: {
          fullName: "",
          username: "",
          password: ""
        }
      }
    }),
    {
      database,
      users: []
    }
  );

  const users = await runtime.repositories.auth.listUsers();
  const reviewerActor = await runtime.authService.resolveRequestActor({
    headers: {
      authorization: "Bearer reviewer-demo-token"
    }
  });
  const auditorActor = await runtime.authService.resolveRequestActor({
    headers: {
      authorization: "Bearer auditor-demo-token"
    }
  });

  assert.equal(users.length, 3);
  const expectedBootstrapUsername = DEFAULT_DEV_TOKENS[0].username;
  assert.deepEqual(
    users.map((user) => user.username),
    [expectedBootstrapUsername, "reviewer", "auditor"]
  );
  assert.equal(reviewerActor.userId, "2");
  assert.equal(auditorActor.userId, "3");
}

async function runtimeResolvesDevTokenToDatabaseActorId() {
  const database = createMockAuthDatabase({
    users: [
      {
        id: 42,
        roleCode: "admin",
        fullName: "Platform Admin",
        username: null,
        email: "admin@example.test"
      }
    ]
  });
  const runtime = await createRuntime(
    createBaseConfig({
      database: {
        enabled: true,
        url: "postgres://example.test/mock",
        sslMode: "disable"
      },
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: [
          {
            token: "admin-demo-token",
            userId: "legacy-admin",
            fullName: "Platform Admin",
            roleCode: "admin",
            email: "admin@example.test"
          }
        ],
        bootstrapAdmin: {
          fullName: "",
          username: "",
          password: ""
        }
      }
    }),
    {
      database,
      users: []
    }
  );

  const actor = await runtime.authService.resolveRequestActor({
    headers: {
      authorization: "Bearer admin-demo-token"
    }
  });

  assert.equal(actor.userId, "42");
  assert.equal(actor.email, "admin@example.test");
}

async function shippedReviewerDefaultTokenResolvesToDatabaseUserId() {
  const database = createMockAuthDatabase({
    users: [
      {
        id: 52,
        roleCode: "reviewer",
        fullName: "Application Reviewer",
        username: "reviewer",
        email: null
      }
    ]
  });
  const runtime = await createRuntime(
    createBaseConfig({
      database: {
        enabled: true,
        url: "postgres://example.test/mock",
        sslMode: "disable"
      },
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: DEFAULT_DEV_TOKENS,
        bootstrapAdmin: {
          fullName: "",
          username: "",
          password: ""
        }
      }
    }),
    {
      database,
      users: []
    }
  );

  const actor = await runtime.authService.resolveRequestActor({
    headers: {
      authorization: "Bearer reviewer-demo-token"
    }
  });

  assert.equal(actor.userId, "52");
  assert.equal(actor.roleCode, "reviewer");
}

async function shippedAuditorDefaultTokenResolvesToDatabaseUserId() {
  const database = createMockAuthDatabase({
    users: [
      {
        id: 53,
        roleCode: "auditor",
        fullName: "Audit Officer",
        username: "auditor",
        email: null
      }
    ]
  });
  const runtime = await createRuntime(
    createBaseConfig({
      database: {
        enabled: true,
        url: "postgres://example.test/mock",
        sslMode: "disable"
      },
      auth: {
        mode: "dev-token",
        requiredForWrite: true,
        devTokens: DEFAULT_DEV_TOKENS,
        bootstrapAdmin: {
          fullName: "",
          username: "",
          password: ""
        }
      }
    }),
    {
      database,
      users: []
    }
  );

  const actor = await runtime.authService.resolveRequestActor({
    headers: {
      authorization: "Bearer auditor-demo-token"
    }
  });

  assert.equal(actor.userId, "53");
  assert.equal(actor.roleCode, "auditor");
}

function initialMigrationMatchesSchemaFile() {
  const schemaPath = path.join(projectRoot, "packages", "database", "postgres", "schema.sql");
  const migrationPath = path.join(
    projectRoot,
    "packages",
    "database",
    "postgres",
    "migrations",
    "001_initial_schema.sql"
  );

  const schemaSql = readFileSync(schemaPath, "utf8");
  const migrationSql = readFileSync(migrationPath, "utf8");

  assert.equal(migrationSql, schemaSql);
}

await passwordHashingDoesNotStoreRawPassword();
await verifyPasswordAcceptsCorrectPassword();
await verifyPasswordRejectsWrongPassword();
await verifyPasswordRejectsMalformedHashes();
generatedSessionTokensLookOpaque();
await bootstrapAdminIsCreatedWhenRepositoryIsEmpty();
await bootstrapAdminIsNotRecreatedOnSecondRun();
await bootstrapAdminIsSkippedWhenConfigIsIncomplete();
  await bootstrapAdminIsCreatedWhenLegacyStaffUsersAlreadyExist();
await runtimeBootstrapSeedsRolesAndCreatesAdminInDatabaseMode();
await defaultPostgresDevTokenStartupCreatesDatabaseUsersForAllShippedTokens();
await runtimeResolvesDevTokenToDatabaseActorId();
await shippedReviewerDefaultTokenResolvesToDatabaseUserId();
await shippedAuditorDefaultTokenResolvesToDatabaseUserId();
await loginAndAdminUserManagementWork();
await passwordModeRejectsConfiguredDevTokens();
passwordModeRequiresSessionSecret();
await repeatedFailedLoginsAreRateLimited();
await passwordSessionsSurviveFreshServiceInstances();
await passwordResetInvalidatesExistingSessionTokensAcrossServiceInstances();
await lastActiveAdminCannotBeDeletedOrDemoted();
await protectedBootstrapAdminCannotBeRenamedDemotedDeactivatedOrDeleted();
reviewerCannotAccessRestrictedModules();
initialMigrationMatchesSchemaFile();

console.log("auth-service-tests: ok");
