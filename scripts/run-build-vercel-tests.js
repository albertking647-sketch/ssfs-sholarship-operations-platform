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

runBuild();
assertBuiltModulesExist();

console.log("build-vercel-tests: ok");
