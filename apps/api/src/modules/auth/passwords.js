import {
  createHmac,
  pbkdf2 as pbkdf2Callback,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);

const HASH_ALGORITHM = "sha512";
const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const SALT_HEX_LENGTH = SALT_BYTES * 2;
const DERIVED_KEY_HEX_LENGTH = KEY_LENGTH * 2;
const SESSION_TOKEN_VERSION = "v1";

function isExpectedHex(value, expectedLength) {
  return (
    typeof value === "string" &&
    value.length === expectedLength &&
    /^[a-f0-9]+$/i.test(value)
  );
}

function parsePasswordHash(passwordHash) {
  const [scheme, iterationText, saltHex, derivedKeyHex] = String(passwordHash || "").split("$");

  if (
    scheme !== "pbkdf2" ||
    !iterationText ||
    !saltHex ||
    !derivedKeyHex
  ) {
    return null;
  }

  const iterations = Number.parseInt(iterationText, 10);
  if (
    iterations !== ITERATIONS ||
    !isExpectedHex(saltHex, SALT_HEX_LENGTH) ||
    !isExpectedHex(derivedKeyHex, DERIVED_KEY_HEX_LENGTH)
  ) {
    return null;
  }

  return {
    iterations,
    salt: Buffer.from(saltHex, "hex"),
    derivedKey: Buffer.from(derivedKeyHex, "hex")
  };
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function fromBase64Url(value) {
  const normalizedValue = String(value || "").replace(/-/gu, "+").replace(/_/gu, "/");
  const requiredPadding = (4 - (normalizedValue.length % 4 || 4)) % 4;
  return Buffer.from(`${normalizedValue}${"=".repeat(requiredPadding)}`, "base64");
}

function buildSessionSigningKey(passwordHash, sessionSecret = "") {
  return `${String(sessionSecret || "")}:${String(passwordHash || "")}`;
}

function signSessionPayload(encodedPayload, passwordHash, sessionSecret = "") {
  return toBase64Url(
    createHmac("sha256", buildSessionSigningKey(passwordHash, sessionSecret))
      .update(encodedPayload)
      .digest()
  );
}

export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM);

  return `pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, passwordHash) {
  const parsedHash = parsePasswordHash(passwordHash);
  if (!parsedHash || parsedHash.salt.length === 0 || parsedHash.derivedKey.length === 0) {
    return false;
  }

  const candidateKey = await pbkdf2(
    password,
    parsedHash.salt,
    parsedHash.iterations,
    parsedHash.derivedKey.length,
    HASH_ALGORITHM
  );

  return timingSafeEqual(candidateKey, parsedHash.derivedKey);
}

export function generateSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

export function createSignedSessionToken(actor, passwordHash, sessionSecret = "", expiresInMs) {
  const now = Date.now();
  const ttlMs = Number.isFinite(expiresInMs) && expiresInMs > 0
    ? Math.floor(expiresInMs)
    : 12 * 60 * 60 * 1000;
  const payload = {
    sessionId: generateSessionToken(),
    userId: String(actor?.userId || ""),
    username: String(actor?.username || ""),
    roleCode: String(actor?.roleCode || ""),
    email: actor?.email || null,
    status: String(actor?.status || "active"),
    issuedAt: now,
    expiresAt: now + ttlMs
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload, passwordHash, sessionSecret);

  return `${SESSION_TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export function readSessionTokenClaims(token) {
  const [version, encodedPayload, signature] = String(token || "").split(".");
  if (version !== SESSION_TOKEN_VERSION || !encodedPayload || !signature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.sessionId ||
      !payload.userId ||
      !payload.roleCode ||
      !payload.status ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt)
    ) {
      return null;
    }

    return {
      sessionId: String(payload.sessionId),
      userId: String(payload.userId),
      username: String(payload.username || ""),
      roleCode: String(payload.roleCode),
      email: payload.email || null,
      status: String(payload.status),
      issuedAt: Number(payload.issuedAt),
      expiresAt: Number(payload.expiresAt)
    };
  } catch {
    return null;
  }
}

export function verifySignedSessionToken(
  token,
  passwordHash,
  sessionSecret = "",
  now = Date.now()
) {
  const [version, encodedPayload, signature] = String(token || "").split(".");
  if (version !== SESSION_TOKEN_VERSION || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(encodedPayload, passwordHash, sessionSecret);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length === 0 ||
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  const claims = readSessionTokenClaims(token);
  if (!claims || claims.expiresAt <= Number(now)) {
    return null;
  }

  return claims;
}
