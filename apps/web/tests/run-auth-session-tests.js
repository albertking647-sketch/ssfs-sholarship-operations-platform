import assert from "node:assert/strict";
import fs from "node:fs";

import {
  AUTH_SESSION_TOKEN_KEY,
  readStoredAuthToken,
  readStoredAuthTokenFromStorages,
  writeStoredAuthToken,
  writeStoredAuthTokenToStorages
} from "../src/authSession.js";

function createFakeStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function persistsAuthTokensInSessionStorage() {
  const storage = createFakeStorage();

  assert.equal(readStoredAuthToken(storage), "");
  assert.equal(writeStoredAuthToken(storage, "  active-session  "), "active-session");
  assert.equal(readStoredAuthToken(storage), "active-session");
  assert.equal(writeStoredAuthToken(storage, ""), "");
  assert.equal(readStoredAuthToken(storage), "");
}

function keepsOnlyAnInSessionRestoreHintAndMigratesLegacyPersistentCopies() {
  const sessionStorage = createFakeStorage();
  const localStorage = createFakeStorage();

  assert.equal(
    writeStoredAuthTokenToStorages([sessionStorage, localStorage], "  active-session  "),
    "active-session"
  );
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "active-session");
  assert.equal(readStoredAuthToken(sessionStorage), "active-session");
  assert.equal(readStoredAuthToken(localStorage), "");

  localStorage.setItem(AUTH_SESSION_TOKEN_KEY, "legacy-session");
  writeStoredAuthToken(sessionStorage, "");
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "legacy-session");
  assert.equal(readStoredAuthToken(sessionStorage), "legacy-session");
  assert.equal(readStoredAuthToken(localStorage), "");

  assert.equal(writeStoredAuthTokenToStorages([sessionStorage, localStorage], ""), "");
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "");
  assert.equal(readStoredAuthToken(sessionStorage), "");
  assert.equal(readStoredAuthToken(localStorage), "");
}

function hidesApiUrlFromLoginForm() {
  const html = fs.readFileSync(
    new URL("../index.html", import.meta.url),
    "utf8"
  );

  assert.match(
    html,
    /<input id="loginApiUrl" name="loginApiUrl" type="hidden" value="" \/>/
  );
  assert.doesNotMatch(
    html,
    /<span>API URL<\/span>/
  );
}

function usesStableStorageKey() {
  assert.equal(AUTH_SESSION_TOKEN_KEY, "ssfs-auth-session-active");
}

persistsAuthTokensInSessionStorage();
keepsOnlyAnInSessionRestoreHintAndMigratesLegacyPersistentCopies();
hidesApiUrlFromLoginForm();
usesStableStorageKey();

console.log("auth-session-tests: ok");
