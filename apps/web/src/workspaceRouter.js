const VALID_MODULES = new Set([
  "dashboard",
  "registry",
  "applications",
  "waitlist",
  "awards",
  "support",
  "reports"
]);

const DEFAULTS = {
  module: "dashboard",
  registrySection: "import",
  applicationsSection: "import",
  beneficiarySection: "imports"
};

const VALID_REGISTRY_SECTIONS = new Set(["import", "search", "duplicates", "history"]);
const VALID_APPLICATION_SECTIONS = new Set([
  "import",
  "registry",
  "review",
  "exports",
  "outcomes",
  "messaging"
]);
const VALID_BENEFICIARY_SECTIONS = new Set(["imports", "beneficiaries"]);

function normalizeRoute(input = {}) {
  const route = {
    module: VALID_MODULES.has(input.module) ? input.module : DEFAULTS.module,
    registrySection: VALID_REGISTRY_SECTIONS.has(input.registrySection)
      ? input.registrySection
      : DEFAULTS.registrySection,
    applicationsSection: VALID_APPLICATION_SECTIONS.has(input.applicationsSection)
      ? input.applicationsSection
      : DEFAULTS.applicationsSection,
    beneficiarySection: VALID_BENEFICIARY_SECTIONS.has(input.beneficiarySection)
      ? input.beneficiarySection
      : DEFAULTS.beneficiarySection
  };

  return route;
}

function parseRouteFromHash(hashValue = "") {
  const sanitizedHash = String(hashValue || "").trim();
  const routePath = sanitizedHash.startsWith("#/") ? sanitizedHash.slice(2) : "";
  const [moduleName = "", sectionName = ""] = routePath.split("/");
  return normalizeRoute({
    module: moduleName || DEFAULTS.module,
    registrySection: sectionName,
    applicationsSection: sectionName,
    beneficiarySection: sectionName
  });
}

function buildHashFromRoute(routeInput = {}) {
  const route = normalizeRoute(routeInput);
  if (route.module === "registry") {
    return `#/registry/${route.registrySection}`;
  }
  if (route.module === "applications") {
    return `#/applications/${route.applicationsSection}`;
  }
  if (route.module === "awards") {
    return `#/awards/${route.beneficiarySection}`;
  }
  return `#/${route.module}`;
}

function routeFromWorkspaceState(state = {}) {
  return normalizeRoute({
    module: state.activeModule,
    registrySection: state.activeSection,
    applicationsSection: state.activeApplicationsSection,
    beneficiarySection: state.activeBeneficiarySection
  });
}

export {
  DEFAULTS,
  VALID_APPLICATION_SECTIONS,
  VALID_BENEFICIARY_SECTIONS,
  VALID_MODULES,
  VALID_REGISTRY_SECTIONS,
  buildHashFromRoute,
  normalizeRoute,
  parseRouteFromHash,
  routeFromWorkspaceState
};
