const MODULES_BY_ROLE = {
  admin: ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"],
  reviewer: ["dashboard", "applications", "support"],
  auditor: ["dashboard", "reports"]
};

export function canRoleAccessModule(roleCode, moduleKey) {
  return (MODULES_BY_ROLE[roleCode] || []).includes(moduleKey);
}
