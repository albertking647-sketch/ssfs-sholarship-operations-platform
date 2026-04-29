import assert from "node:assert/strict";

import {
  canRoleAccessModule,
  getVisibleModulesForRole,
  resolveModuleForRole
} from "../src/roleAccess.js";

assert.deepEqual(getVisibleModulesForRole("reviewer"), ["dashboard", "applications", "support"]);
assert.deepEqual(
  getVisibleModulesForRole("admin"),
  ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"]
);
assert.deepEqual(getVisibleModulesForRole("auditor"), ["dashboard", "reports"]);
assert.equal(canRoleAccessModule("reviewer", "reports"), false);
assert.equal(canRoleAccessModule("reviewer", "applications"), true);
assert.equal(canRoleAccessModule("auditor", "reports"), true);
assert.equal(canRoleAccessModule("auditor", "applications"), false);
assert.equal(resolveModuleForRole("reviewer", "registry"), "dashboard");
assert.equal(resolveModuleForRole("reviewer", "reports"), "dashboard");
assert.equal(resolveModuleForRole("reviewer", "applications"), "applications");
assert.equal(resolveModuleForRole("auditor", "registry"), "dashboard");
assert.equal(resolveModuleForRole("auditor", "reports"), "reports");

console.log("role-access-tests: ok");
