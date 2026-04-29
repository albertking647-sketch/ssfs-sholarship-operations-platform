const MODULES_BY_ROLE = {
  admin: ["dashboard", "registry", "applications", "waitlist", "awards", "support", "reports"],
  reviewer: ["dashboard", "applications", "support"],
  auditor: ["dashboard", "reports"]
};

export function getVisibleModulesForRole(roleCode) {
  return [...(MODULES_BY_ROLE[roleCode] || ["dashboard"])];
}

export function canRoleAccessModule(roleCode, moduleKey) {
  return getVisibleModulesForRole(roleCode).includes(moduleKey);
}

export function resolveModuleForRole(roleCode, requestedModule) {
  const visibleModules = getVisibleModulesForRole(roleCode);
  if (visibleModules.includes(requestedModule)) {
    return requestedModule;
  }

  return visibleModules[0] || "dashboard";
}
