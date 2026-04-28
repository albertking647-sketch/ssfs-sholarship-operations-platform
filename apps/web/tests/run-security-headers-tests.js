import assert from "node:assert/strict";

import {
  HARDENING_HEADERS,
  buildHeaderMap
} from "../../../scripts/httpSecurityHeaders.js";

function buildsExpectedHeaderMap() {
  assert.deepEqual(buildHeaderMap(HARDENING_HEADERS), {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer"
  });
}

buildsExpectedHeaderMap();

console.log("security-headers-tests: ok");
