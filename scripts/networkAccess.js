function normalizeCandidate(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  const zoneIndex = text.indexOf("%");
  if (zoneIndex >= 0) {
    text = text.slice(0, zoneIndex);
  }

  if (text.startsWith("::ffff:") && text.slice(7).includes(".")) {
    return text.slice(7);
  }

  return text;
}

function getHeaderValue(headers, key) {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const value = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return value || "";
}

function getForwardedAddress(headers) {
  const forwardedFor = String(getHeaderValue(headers, "x-forwarded-for") || "");
  if (!forwardedFor) {
    return "";
  }

  const [firstAddress] = forwardedFor.split(",");
  return normalizeCandidate(firstAddress);
}

function isIpv4Address(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function ipv4ToInt(value) {
  return String(value || "")
    .split(".")
    .map((part) => Number(part))
    .reduce((result, part) => ((result << 8) >>> 0) + part, 0) >>> 0;
}

function parseIpv4Rule(address, prefixLength) {
  const normalizedPrefix = prefixLength === undefined ? 32 : Number(prefixLength);
  if (!Number.isInteger(normalizedPrefix) || normalizedPrefix < 0 || normalizedPrefix > 32) {
    return null;
  }

  const mask =
    normalizedPrefix === 0 ? 0 : ((0xffffffff << (32 - normalizedPrefix)) >>> 0);

  return {
    type: "ipv4",
    network: ipv4ToInt(address) & mask,
    mask
  };
}

export function buildTrustedNetworkRules(rawValue) {
  const entries = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue || "")
        .split(/[,\n;]/u)
        .map((item) => item.trim())
        .filter(Boolean);

  return entries
    .map((entry) => {
      const normalized = normalizeCandidate(entry);
      if (!normalized) return null;

      const [addressPart, prefixPart] = normalized.split("/");
      const address = normalizeCandidate(addressPart);

      if (isIpv4Address(address)) {
        return parseIpv4Rule(address, prefixPart);
      }

      if (address.includes(":")) {
        const prefixLength = prefixPart === undefined ? 128 : Number(prefixPart);
        if (!Number.isInteger(prefixLength) || prefixLength !== 128) {
          return null;
        }

        return {
          type: "ipv6-exact",
          address
        };
      }

      return {
        type: "exact",
        address
      };
    })
    .filter(Boolean);
}

export function getRemoteAddressFromRequest(req) {
  return normalizeCandidate(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
}

export function getTrustedNetworkRemoteAddress(req, { trustProxyHeaders = false } = {}) {
  if (trustProxyHeaders) {
    const forwardedAddress = getForwardedAddress(req?.headers);
    if (forwardedAddress) {
      return forwardedAddress;
    }
  }

  return getRemoteAddressFromRequest(req);
}

export function isRemoteAddressAllowed(remoteAddress, rules = []) {
  const normalizedRemoteAddress = normalizeCandidate(remoteAddress);
  if (!rules.length) {
    return true;
  }
  if (!normalizedRemoteAddress) {
    return false;
  }

  if (isIpv4Address(normalizedRemoteAddress)) {
    const remoteNumber = ipv4ToInt(normalizedRemoteAddress);
    return rules.some((rule) => {
      if (rule.type === "ipv4") {
        return (remoteNumber & rule.mask) === rule.network;
      }
      return rule.address === normalizedRemoteAddress;
    });
  }

  return rules.some((rule) => rule.address === normalizedRemoteAddress);
}

export function enforceTrustedNetworkAccess(
  req,
  res,
  rules = [],
  { trustProxyHeaders = false } = {}
) {
  const remoteAddress = getTrustedNetworkRemoteAddress(req, { trustProxyHeaders });
  if (isRemoteAddressAllowed(remoteAddress, rules)) {
    return {
      allowed: true,
      remoteAddress
    };
  }

  res.writeHead(403, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(
    JSON.stringify({
      ok: false,
      message: "This API is available only from approved local networks.",
      remoteAddress
    })
  );

  return {
    allowed: false,
    remoteAddress
  };
}
