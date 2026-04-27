import assert from "node:assert/strict";

import {
  buildTrustedNetworkRules,
  isRemoteAddressAllowed
} from "../../../scripts/networkAccess.js";

function supportsExactAndCidrIpv4Matches() {
  const rules = buildTrustedNetworkRules("127.0.0.1/32,192.168.42.0/24,10.0.0.9");

  assert.equal(isRemoteAddressAllowed("127.0.0.1", rules), true);
  assert.equal(isRemoteAddressAllowed("192.168.42.38", rules), true);
  assert.equal(isRemoteAddressAllowed("10.0.0.9", rules), true);
  assert.equal(isRemoteAddressAllowed("192.168.43.10", rules), false);
}

function supportsIpv4MappedIpv6Loopback() {
  const rules = buildTrustedNetworkRules("127.0.0.1/32,::1");

  assert.equal(isRemoteAddressAllowed("::ffff:127.0.0.1", rules), true);
  assert.equal(isRemoteAddressAllowed("::1", rules), true);
  assert.equal(isRemoteAddressAllowed("::ffff:192.168.42.10", rules), false);
}

function emptyRulesAllowAll() {
  const rules = buildTrustedNetworkRules("");
  assert.equal(isRemoteAddressAllowed("203.0.113.10", rules), true);
}

supportsExactAndCidrIpv4Matches();
supportsIpv4MappedIpv6Loopback();
emptyRulesAllowAll();

console.log("network-access-tests: ok");
