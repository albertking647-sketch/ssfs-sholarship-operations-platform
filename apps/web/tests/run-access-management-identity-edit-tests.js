import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJs = fs.readFileSync(path.resolve(__dirname, "..", "src", "app.js"), "utf8");

function accessCardsExposeInlineIdentityEditing() {
  assert.match(appJs, /data-access-action="edit-identity"/u);
  assert.match(appJs, /Edit identity/u);
  assert.match(appJs, /data-access-identity-form/u);
  assert.match(appJs, /name="fullName"/u);
  assert.match(appJs, /name="username"/u);
  assert.match(appJs, /data-access-action="cancel-identity"/u);
}

function identitySavePatchesFullNameAndUsername() {
  assert.match(appJs, /async function handleAccessIdentitySubmit\(/u);
  assert.match(appJs, /method: "PATCH"/u);
  assert.match(appJs, /body: JSON\.stringify\(\{\s*fullName,\s*username\s*\}\)/u);
}

function selfIdentitySaveRefreshesSessionDisplayAndStoredUsername() {
  assert.match(appJs, /function syncCurrentActorIdentity/u);
  assert.match(appJs, /state\.session\.actor\.fullName = updatedUser\.fullName/u);
  assert.match(appJs, /state\.session\.actor\.username = updatedUser\.username/u);
  assert.match(appJs, /elements\.loginUsername\.value = updatedUser\.username/u);
  assert.match(appJs, /renderAccessShell\(\)/u);
}

accessCardsExposeInlineIdentityEditing();
identitySavePatchesFullNameAndUsername();
selfIdentitySaveRefreshesSessionDisplayAndStoredUsername();

console.log("access-management-identity-edit-tests: ok");
