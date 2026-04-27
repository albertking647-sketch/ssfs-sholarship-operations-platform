import assert from "node:assert/strict";

import {
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

derivesApiUrlFromCurrentHost();
prefersDynamicDefaultOverLoopbackOnRemoteClients();
stripsSensitiveLoginQueryParams();

console.log("network-helper-tests: ok");
