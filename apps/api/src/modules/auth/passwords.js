import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);

const HASH_ALGORITHM = "sha512";
const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const SALT_HEX_LENGTH = SALT_BYTES * 2;
const DERIVED_KEY_HEX_LENGTH = KEY_LENGTH * 2;

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
