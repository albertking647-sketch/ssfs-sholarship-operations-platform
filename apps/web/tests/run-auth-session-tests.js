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
  assert.equal(writeStoredAuthToken(storage, "  abc123  "), "abc123");
  assert.equal(readStoredAuthToken(storage), "abc123");
  assert.equal(writeStoredAuthToken(storage, ""), "");
  assert.equal(readStoredAuthToken(storage), "");
}

function fallsBackAcrossBrowserStorages() {
  const sessionStorage = createFakeStorage();
  const localStorage = createFakeStorage();

  assert.equal(
    writeStoredAuthTokenToStorages([sessionStorage, localStorage], "  abc123  "),
    "abc123"
  );
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "abc123");

  sessionStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "abc123");

  assert.equal(writeStoredAuthTokenToStorages([sessionStorage, localStorage], ""), "");
  assert.equal(readStoredAuthTokenFromStorages([sessionStorage, localStorage]), "");
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
  assert.equal(AUTH_SESSION_TOKEN_KEY, "ssfs-auth-session-token");
}

persistsAuthTokensInSessionStorage();
fallsBackAcrossBrowserStorages();
hidesApiUrlFromLoginForm();
usesStableStorageKey();

console.log("auth-session-tests: ok");
