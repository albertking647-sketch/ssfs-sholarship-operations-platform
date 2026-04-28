import assert from "node:assert/strict";

import {
  buildCookieSessionFetchOptions,
  buildSessionEndpointUrl,
  deriveDefaultApiUrl,
  getSanitizedLoginUrl,
  shouldUseStoredApiUrl
} from "../src/network.js";

function derivesApiUrlFromCurrentHost() {
  assert.equal(
    deriveDefaultApiUrl({ protocol: "http:", host: "192.168.42.38:4400", hostname: "192.168.42.38" }),
    "http://192.168.42.38:4400"
  );
  assert.equal(
    deriveDefaultApiUrl({ protocol: "http:", host: "localhost:4400", hostname: "localhost" }),
    "http://localhost:4400"
  );
}

function prefersDynamicDefaultOverLoopbackOnRemoteClients() {
  assert.equal(
    shouldUseStoredApiUrl("http://127.0.0.1:4300", {
      protocol: "http:",
      host: "192.168.42.38:4400",
      hostname: "192.168.42.38"
    }),
    false
  );
  assert.equal(
    shouldUseStoredApiUrl("http://192.168.42.38:4300", {
      protocol: "http:",
      host: "192.168.42.38:4400",
      hostname: "192.168.42.38"
    }),
    false
  );
  assert.equal(
    shouldUseStoredApiUrl("http://192.168.42.38:4400", {
      protocol: "http:",
      host: "192.168.42.38:4400",
      hostname: "192.168.42.38"
    }),
    true
  );
}

function stripsSensitiveLoginQueryParams() {
  assert.equal(
    getSanitizedLoginUrl(
      "https://ssfs-sholarship-operations-platform.vercel.app/?apiUrl=&authToken=&loginApiUrl=&loginUsername=aeking&loginPassword=secret"
    ),
    "/"
  );
  assert.equal(
    getSanitizedLoginUrl(
      "https://ssfs-sholarship-operations-platform.vercel.app/?foo=bar&loginUsername=aeking#top"
    ),
    "/?foo=bar#top"
  );
  assert.equal(
    getSanitizedLoginUrl("https://ssfs-sholarship-operations-platform.vercel.app/?foo=bar"),
    ""
  );
}

function buildsNoStoreCookieSessionFetchOptions() {
  assert.deepEqual(
    buildCookieSessionFetchOptions(),
    {
      cache: "no-store",
      credentials: "same-origin",
      method: "GET"
    }
  );

  assert.deepEqual(
    buildCookieSessionFetchOptions({
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{\"ok\":true}"
    }),
    {
      cache: "no-store",
      credentials: "same-origin",
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{\"ok\":true}"
    }
  );
}

function buildsCacheBustedSessionUrls() {
  assert.equal(
    buildSessionEndpointUrl(
      "https://ssfs-sholarship-operations-platform.vercel.app",
      12345
    ),
    "https://ssfs-sholarship-operations-platform.vercel.app/api/auth/session?_=12345"
  );
  assert.equal(
    buildSessionEndpointUrl(
      "https://ssfs-sholarship-operations-platform.vercel.app/",
      ""
    ),
    "https://ssfs-sholarship-operations-platform.vercel.app/api/auth/session"
  );
}

derivesApiUrlFromCurrentHost();
prefersDynamicDefaultOverLoopbackOnRemoteClients();
stripsSensitiveLoginQueryParams();
buildsNoStoreCookieSessionFetchOptions();
buildsCacheBustedSessionUrls();

console.log("network-helper-tests: ok");
