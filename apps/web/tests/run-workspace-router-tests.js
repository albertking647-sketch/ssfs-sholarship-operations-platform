import assert from "node:assert/strict";

import {
  buildHashFromRoute,
  parseRouteFromHash,
  routeFromWorkspaceState
} from "../src/workspaceRouter.js";

function parsesKnownModuleSectionHashes() {
  assert.deepEqual(parseRouteFromHash("#/applications/review"), {
    module: "applications",
    registrySection: "import",
    applicationsSection: "review",
    beneficiarySection: "imports"
  });
  assert.deepEqual(parseRouteFromHash("#/registry/search"), {
    module: "registry",
    registrySection: "search",
    applicationsSection: "import",
    beneficiarySection: "imports"
  });
  assert.deepEqual(parseRouteFromHash("#/awards/beneficiaries"), {
    module: "awards",
    registrySection: "import",
    applicationsSection: "import",
    beneficiarySection: "beneficiaries"
  });
}

function fallsBackForInvalidHashValues() {
  assert.deepEqual(parseRouteFromHash("#/unknown/value"), {
    module: "dashboard",
    registrySection: "import",
    applicationsSection: "import",
    beneficiarySection: "imports"
  });
  assert.deepEqual(parseRouteFromHash(""), {
    module: "dashboard",
    registrySection: "import",
    applicationsSection: "import",
    beneficiarySection: "imports"
  });
}

function buildsExpectedHashesFromRouteData() {
  assert.equal(buildHashFromRoute({ module: "dashboard" }), "#/dashboard");
  assert.equal(buildHashFromRoute({ module: "applications", applicationsSection: "messaging" }), "#/applications/messaging");
  assert.equal(buildHashFromRoute({ module: "registry", registrySection: "history" }), "#/registry/history");
  assert.equal(buildHashFromRoute({ module: "awards", beneficiarySection: "beneficiaries" }), "#/awards/beneficiaries");
}

function mapsWorkspaceStateToNormalizedRoute() {
  const route = routeFromWorkspaceState({
    activeModule: "applications",
    activeSection: "search",
    activeApplicationsSection: "review",
    activeBeneficiarySection: "beneficiaries"
  });
  assert.equal(route.module, "applications");
  assert.equal(route.applicationsSection, "review");
  assert.equal(route.registrySection, "search");
  assert.equal(route.beneficiarySection, "beneficiaries");
}

parsesKnownModuleSectionHashes();
fallsBackForInvalidHashValues();
buildsExpectedHashesFromRouteData();
mapsWorkspaceStateToNormalizedRoute();

console.log("workspace-router-tests: ok");
