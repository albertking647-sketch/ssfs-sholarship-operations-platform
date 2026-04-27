# Authentication And Role Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real username/password login with bootstrap admin setup, admin-managed staff accounts, reviewer-restricted module access, named reviewer leaderboard cards, and the approved UI cleanup items.

**Architecture:** Build a database-backed local authentication system on top of the existing API/runtime structure. Keep a bootstrap admin in `.env.local` for first setup, add login/session endpoints, then enforce role-based access in both the API and the web shell so reviewers only see and use Dashboard, Applications, and Food & Clothing Support.

**Tech Stack:** Node.js, existing HTTP router, Postgres/sample repositories, browser module frontend, local bearer-token sessions

---

### Task 1: Add Auth Data Helpers And Failing Tests

**Files:**
- Create: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\auth\passwords.js`
- Create: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-auth-service-tests.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\auth\service.js`

- [ ] **Step 1: Write the failing auth helper tests**

```js
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  createSessionToken
} from "../src/modules/auth/passwords.js";

async function passwordHashingWorks() {
  const hash = await hashPassword("StrongPass!23");
  assert.notEqual(hash, "StrongPass!23");
  assert.equal(await verifyPassword("StrongPass!23", hash), true);
  assert.equal(await verifyPassword("wrong-pass", hash), false);
}

function sessionTokenLooksOpaque() {
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: FAIL with module-not-found or missing export errors for `passwords.js`

- [ ] **Step 3: Write minimal implementation**

```js
import crypto from "node:crypto";

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return `${salt}:${derived}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: PASS with `auth-service-tests: ok`

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/auth/passwords.js apps/api/tests/run-auth-service-tests.js
git commit -m "feat: add auth password helpers"
```

### Task 2: Add User Repository Support And Bootstrap Admin

**Files:**
- Create: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\auth\repository.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\packages\database\postgres\schema.sql`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\packages\database\postgres\migrations\001_initial_schema.sql`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\config.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\bootstrap\createRuntime.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-auth-service-tests.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\.env.example`

- [ ] **Step 1: Write the failing bootstrap-admin test**

```js
async function bootstrapAdminIsCreatedOnce() {
  const repository = createAuthRepository({ database: { enabled: false } });
  const service = createAuthService({
    config: {
      auth: {
        bootstrapAdmin: {
          fullName: "Platform Admin",
          username: "admin",
          password: "StrongPass!23"
        }
      }
    },
    repository
  });

  await service.ensureBootstrapAdmin();
  const users = await repository.listUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].username, "admin");

  await service.ensureBootstrapAdmin();
  const usersAfterSecondRun = await repository.listUsers();
  assert.equal(usersAfterSecondRun.length, 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: FAIL because repository/bootstrap methods do not exist yet

- [ ] **Step 3: Extend schema and config**

```sql
ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
```

```js
bootstrapAdmin: {
  fullName: process.env.BOOTSTRAP_ADMIN_FULL_NAME || "",
  username: process.env.BOOTSTRAP_ADMIN_USERNAME || "",
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD || ""
}
```

- [ ] **Step 4: Add minimal repository and runtime wiring**

```js
export function createAuthRepository({ database }) {
  return database.enabled ? createPostgresAuthRepository({ database }) : createSampleAuthRepository();
}

const repositories = {
  auth: createAuthRepository({ database }),
  // existing repositories...
};
```

- [ ] **Step 5: Add bootstrap-admin creation**

```js
async ensureBootstrapAdmin() {
  const totalUsers = await repositories.auth.countUsers();
  if (totalUsers > 0) return null;
  const bootstrap = config.auth.bootstrapAdmin;
  if (!bootstrap.fullName || !bootstrap.username || !bootstrap.password) {
    return null;
  }
  const passwordHash = await hashPassword(bootstrap.password);
  return repositories.auth.createUser({
    fullName: bootstrap.fullName,
    username: bootstrap.username,
    passwordHash,
    roleCode: "admin",
    status: "active"
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: PASS with bootstrap-admin assertions succeeding

- [ ] **Step 7: Commit**

```powershell
git add packages/database/postgres/schema.sql packages/database/postgres/migrations/001_initial_schema.sql apps/api/src/config.js apps/api/src/bootstrap/createRuntime.js apps/api/src/modules/auth/repository.js apps/api/tests/run-auth-service-tests.js .env.example
git commit -m "feat: add auth repository and bootstrap admin"
```

### Task 3: Add Login, Logout, Session Resolution, And Account Management API

**Files:**
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\auth\service.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\auth\routes.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-auth-service-tests.js`

- [ ] **Step 1: Write the failing login and user-management tests**

```js
async function loginAndAdminUserManagementWork() {
  await service.ensureBootstrapAdmin();
  const login = await service.login({ username: "admin", password: "StrongPass!23" });
  assert.ok(login.token);
  assert.equal(login.actor.roleCode, "admin");

  const reviewer = await service.createUser({
    fullName: "Jane Review",
    username: "jreview",
    password: "ReviewPass!23",
    roleCode: "reviewer"
  }, login.actor);
  assert.equal(reviewer.roleCode, "reviewer");

  const reset = await service.resetPassword(reviewer.id, { password: "ResetPass!45" }, login.actor);
  assert.equal(reset.updated, true);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: FAIL because `login`, `createUser`, or `resetPassword` is missing

- [ ] **Step 3: Implement service methods**

```js
async login({ username, password }) {
  const user = await repositories.auth.getUserByUsername(username);
  if (!user || user.status !== "active") {
    throw new UnauthorizedError("Username or password is incorrect.");
  }
  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) {
    throw new UnauthorizedError("Username or password is incorrect.");
  }
  const token = createSessionToken();
  await repositories.auth.saveSession({ token, userId: user.id });
  return { token, actor: mapActor(user) };
}
```

- [ ] **Step 4: Add auth routes**

```js
{ method: "POST", path: "/api/auth/login", auth: "optional", ... }
{ method: "POST", path: "/api/auth/logout", auth: "required", ... }
{ method: "GET", path: "/api/auth/users", auth: "required", roles: ["admin"], ... }
{ method: "POST", path: "/api/auth/users", auth: "required", roles: ["admin"], ... }
{ method: "PATCH", path: "/api/auth/users/:userId", auth: "required", roles: ["admin"], ... }
{ method: "POST", path: "/api/auth/users/:userId/reset-password", auth: "required", roles: ["admin"], ... }
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: PASS with login, logout, and admin user-management coverage all green

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/auth/service.js apps/api/src/modules/auth/routes.js apps/api/tests/run-auth-service-tests.js
git commit -m "feat: add auth login and staff management routes"
```

### Task 4: Enforce Reviewer Restrictions In API Routes

**Files:**
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\students\routes.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\beneficiaries\routes.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\waitlist\routes.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\reports\routes.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-auth-service-tests.js`

- [ ] **Step 1: Write the failing reviewer-restriction tests**

```js
async function reviewerCannotAccessRestrictedModules() {
  const adminLogin = await service.login({ username: "admin", password: "StrongPass!23" });
  await service.createUser(
    { fullName: "Jane Review", username: "jreview", password: "ReviewPass!23", roleCode: "reviewer" },
    adminLogin.actor
  );
  const reviewerLogin = await service.login({ username: "jreview", password: "ReviewPass!23" });
  assert.equal(reviewerLogin.actor.roleCode, "reviewer");
  assert.equal(canRoleAccessModule("reviewer", "registry"), false);
  assert.equal(canRoleAccessModule("reviewer", "reports"), false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: FAIL because the restriction helpers or route changes are not in place

- [ ] **Step 3: Tighten route roles**

```js
roles: ["admin"] // students
roles: ["admin"] // waitlist
roles: ["admin"] // beneficiaries
roles: ["admin"] // reports
```

Keep Applications and Food & Clothing Support routes open to reviewers where required.

- [ ] **Step 4: Add a small shared role-access helper**

```js
export function canRoleAccessModule(roleCode, moduleKey) {
  const allowedByRole = {
    admin: ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"],
    reviewer: ["dashboard", "applications", "support"]
  };
  return (allowedByRole[roleCode] || []).includes(moduleKey);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: PASS with reviewer restriction assertions green

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/students/routes.js apps/api/src/modules/beneficiaries/routes.js apps/api/src/modules/waitlist/routes.js apps/api/src/modules/reports/routes.js apps/api/tests/run-auth-service-tests.js
git commit -m "feat: enforce reviewer access restrictions in api"
```

### Task 5: Add Login Screen, Session Persistence, And Admin User Management UI

**Files:**
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\index.html`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\src\app.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\src\styles.css`
- Create: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\tests\run-role-access-tests.js`

- [ ] **Step 1: Write the failing frontend role-access tests**

```js
import assert from "node:assert/strict";
import { getVisibleModulesForRole } from "../src/roleAccess.js";

assert.deepEqual(getVisibleModulesForRole("reviewer"), ["dashboard", "applications", "support"]);
assert.deepEqual(
  getVisibleModulesForRole("admin"),
  ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"]
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/web/tests/run-role-access-tests.js
```

Expected: FAIL because the role helper does not exist yet

- [ ] **Step 3: Add login gate and session actions**

```js
async function loginWithCredentials(username, password) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}
```

- [ ] **Step 4: Add admin-only staff management UI**

```html
<section id="accessManagementPanel" hidden>
  <h3>Staff Access</h3>
  <form id="accessManagementForm">...</form>
  <div id="accessManagementList"></div>
</section>
```

- [ ] **Step 5: Add role-filtered sidebar rendering**

```js
function getVisibleModulesForRole(roleCode) {
  return roleCode === "reviewer"
    ? ["dashboard", "applications", "support"]
    : ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"];
}
```

- [ ] **Step 6: Run frontend test to verify it passes**

Run:
```powershell
node apps/web/tests/run-role-access-tests.js
```

Expected: PASS with correct visible-module lists

- [ ] **Step 7: Commit**

```powershell
git add apps/web/index.html apps/web/src/app.js apps/web/src/styles.css apps/web/tests/run-role-access-tests.js
git commit -m "feat: add login gate and admin user management ui"
```

### Task 6: Redirect Reviewers Away From Hidden Modules And Remove Restricted Content

**Files:**
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\src\app.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\index.html`

- [ ] **Step 1: Write the failing redirect/guard test**

```js
assert.equal(resolveModuleForRole("reviewer", "registry"), "dashboard");
assert.equal(resolveModuleForRole("reviewer", "reports"), "dashboard");
assert.equal(resolveModuleForRole("reviewer", "applications"), "applications");
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/web/tests/run-role-access-tests.js
```

Expected: FAIL because module-redirect helper is missing

- [ ] **Step 3: Add redirect guard**

```js
function resolveModuleForRole(roleCode, requestedModule) {
  const visible = getVisibleModulesForRole(roleCode);
  return visible.includes(requestedModule) ? requestedModule : visible[0] || "dashboard";
}
```

- [ ] **Step 4: Apply guard in module restoration and nav changes**

```js
state.activeModule = resolveModuleForRole(getCurrentActorRole(), state.activeModule);
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```powershell
node apps/web/tests/run-role-access-tests.js
```

Expected: PASS with redirect helper behavior green

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app.js apps/web/index.html apps/web/tests/run-role-access-tests.js
git commit -m "feat: guard hidden modules for reviewers"
```

### Task 7: Fix Reviewer Leaderboard Names And Apply Approved UI Cleanup

**Files:**
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\reports\service.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\src\modules\applications\service.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\src\app.js`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\index.html`
- Modify: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-reports-service-tests.js`

- [ ] **Step 1: Write the failing leaderboard test**

```js
assert.deepEqual(
  summary.reviewerLeaderboard.map((item) => item.name),
  ["Jane Review", "Kwame Mensah"]
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
node apps/api/tests/run-reports-service-tests.js
```

Expected: FAIL because generic reviewer labels still collapse identities

- [ ] **Step 3: Update reviewer attribution**

```js
const reviewerName =
  application.reviewedByName ||
  reviewerMeta.reviewedByName ||
  userLookup.get(application.reviewedByUserId)?.fullName ||
  "System";
```

- [ ] **Step 4: Remove approved extra note and trim action-block instructions**

```html
<!-- remove the flagged Applications context note block -->
```

```js
elements.supportFoodBankRegistryPreview.innerHTML = matchedStudent
  ? renderMatchedStudentCard(matchedStudent)
  : "";
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```powershell
node apps/api/tests/run-reports-service-tests.js
npm.cmd run check
```

Expected: PASS and clean syntax checks

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/reports/service.js apps/api/src/modules/applications/service.js apps/web/src/app.js apps/web/index.html apps/api/tests/run-reports-service-tests.js
git commit -m "feat: show real reviewer names and clean ui copy"
```

### Task 8: End-To-End Verification

**Files:**
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-auth-service-tests.js`
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-reports-service-tests.js`
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\web\tests\run-role-access-tests.js`
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-beneficiaries-service-tests.js`
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-food-bank-service-tests.js`
- Test: `C:\Users\Lenovo\Documents\Code Space\student-verification-suite\scholarship-operations-platform-new\apps\api\tests\run-recommended-students-service-tests.js`

- [ ] **Step 1: Run auth tests**

Run:
```powershell
node apps/api/tests/run-auth-service-tests.js
```

Expected: PASS

- [ ] **Step 2: Run frontend role tests**

Run:
```powershell
node apps/web/tests/run-role-access-tests.js
```

Expected: PASS

- [ ] **Step 3: Run report tests**

Run:
```powershell
node apps/api/tests/run-reports-service-tests.js
```

Expected: PASS

- [ ] **Step 4: Run regression checks**

Run:
```powershell
node apps/api/tests/run-beneficiaries-service-tests.js
node apps/api/tests/run-food-bank-service-tests.js
node apps/api/tests/run-recommended-students-service-tests.js
npm.cmd run check
```

Expected: PASS across the existing operational modules

- [ ] **Step 5: Commit**

```powershell
git add .
git commit -m "test: verify auth and role access rollout"
```

## Plan Self-Review

### Spec coverage

- bootstrap admin: covered in Task 2
- username/password login and session: covered in Task 3 and Task 5
- admin-managed staff accounts: covered in Task 3 and Task 5
- reviewer module restriction: covered in Task 4, Task 5, and Task 6
- reviewer leaderboard names: covered in Task 7
- UI cleanup comments: covered in Task 7

### Placeholder scan

- no `TBD` or `TODO` placeholders remain
- each task names exact files
- each code-changing task includes a concrete snippet
- each test step includes a runnable command

### Type consistency

- reviewer role remains `reviewer`
- admin role remains `admin`
- visible module keys are aligned with current app state keys:
  - `dashboard`
  - `registry`
  - `applications`
  - `waitlist`
  - `awards`
  - `support`
  - `reports`

