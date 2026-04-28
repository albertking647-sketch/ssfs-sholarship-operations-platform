import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");
const publicSrcRoot = path.join(publicRoot, "src");
const appScriptPath = path.join(publicSrcRoot, "app.js");
const vercelConfigPath = path.join(repoRoot, "vercel.json");

function runBuild() {
  const result = spawnSync(process.execPath, [path.join(__dirname, "build-vercel.js")], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  assert.equal(result.status, 0, "Vercel build script should succeed.");
}

function extractRelativeModuleImports(source) {
  const imports = [...source.matchAll(/from\s+"(\.\/[^"]+)"/g)];
  return imports.map((match) => match[1]);
}

function assertBuiltModulesExist() {
  assert.equal(fs.existsSync(path.join(publicRoot, "index.html")), true);
  assert.equal(fs.existsSync(appScriptPath), true);

  const appScript = fs.readFileSync(appScriptPath, "utf8");
  for (const relativeImport of extractRelativeModuleImports(appScript)) {
    const builtModulePath = path.resolve(publicSrcRoot, relativeImport);
    assert.equal(
      fs.existsSync(builtModulePath),
      true,
      `Expected built frontend module to exist: ${relativeImport}`
    );
  }
}

function assertVercelSecurityHeadersAreConfigured() {
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
  const headerRules = Array.isArray(vercelConfig.headers) ? vercelConfig.headers : [];
  const globalRule = headerRules.find((rule) => rule.source === "/(.*)");
  assert.ok(globalRule, "Expected vercel.json to define a global security header rule.");

  const headerIndex = new Map(
    (globalRule.headers || []).map((header) => [String(header.key || "").toLowerCase(), header.value])
  );
  assert.equal(headerIndex.get("x-content-type-options"), "nosniff");
  assert.equal(headerIndex.get("x-frame-options"), "DENY");
  assert.equal(headerIndex.get("referrer-policy"), "no-referrer");
}

runBuild();
assertBuiltModulesExist();
assertVercelSecurityHeadersAreConfigured();

console.log("build-vercel-tests: ok");
