import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError
} from "../../lib/errors.js";
import {
  createSignedSessionToken,
  hashPassword,
  readSessionTokenClaims,
  verifySignedSessionToken,
  verifyPassword
} from "./passwords.js";
import { readCookie } from "../../lib/cookies.js";

function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError("Authorization header must use the Bearer scheme.");
  }

  return token.trim();
}

function readPasswordSessionTokenFromRequest(req, sessionCookieName) {
  const bearerToken = parseBearerToken(req?.headers?.authorization);
  if (bearerToken) {
    return bearerToken;
  }

  return readCookie(req?.headers?.cookie, sessionCookieName);
}

function normalizeBootstrapAdmin(bootstrapAdmin = {}) {
  return {
    fullName: String(bootstrapAdmin.fullName || "").trim(),
    username: String(bootstrapAdmin.username || "").trim(),
    password: String(bootstrapAdmin.password || "")
  };
}

function normalizeUserInput(input = {}) {
  return {
    fullName: String(input.fullName || "").trim(),
    username: String(input.username || "").trim(),
    email: String(input.email || "").trim(),
    password: String(input.password || ""),
    roleCode: String(input.roleCode || "").trim(),
    status: String(input.status || "").trim().toLowerCase() === "inactive" ? "inactive" : "active"
  };
}

function normalizeDevTokenUser(entry = {}) {
  return {
    token: String(entry.token || "").trim(),
    userId: String(entry.userId || "").trim(),
    username: String(entry.username || "").trim(),
    email: String(entry.email || "").trim(),
    fullName: String(entry.fullName || "").trim(),
    roleCode: String(entry.roleCode || "").trim()
  };
}

function toFallbackActor(entry, userIndex) {
  const sampleUser = userIndex.get(entry.userId);

  return {
    userId: entry.userId,
    fullName: entry.fullName || sampleUser?.fullName || "",
    roleCode: entry.roleCode || sampleUser?.roleCode || "",
    email: entry.email || sampleUser?.email || null
  };
}

function mapUserToActor(user) {
  return {
    userId: user.id,
    fullName: user.fullName,
    username: user.username || "",
    roleCode: user.roleCode,
    email: user.email || null,
    status: user.status
  };
}

function normalizeLoginRateLimitConfig(settings = {}) {
  const maxAttempts = Number(settings.maxAttempts);
  const windowMs = Number(settings.windowMs);
  const blockMs = Number(settings.blockMs);

  return {
    enabled: settings.enabled !== false,
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 5,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 10 * 60 * 1000,
    blockMs: Number.isFinite(blockMs) && blockMs > 0 ? Math.floor(blockMs) : 15 * 60 * 1000
  };
}

function normalizeIpAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return "";
  }

  const withoutIpv6MappedPrefix = text.startsWith("::ffff:") ? text.slice(7) : text;
  return withoutIpv6MappedPrefix.replace(/^\[|\]$/gu, "");
}

function isPrivateOrLoopbackAddress(address) {
  const normalizedAddress = normalizeIpAddress(address);
  if (!normalizedAddress) {
    return false;
  }

  if (
    normalizedAddress === "::1" ||
    normalizedAddress === "localhost" ||
    normalizedAddress.startsWith("127.") ||
    normalizedAddress.startsWith("10.") ||
    normalizedAddress.startsWith("192.168.") ||
    normalizedAddress.startsWith("169.254.") ||
    normalizedAddress.startsWith("fc") ||
    normalizedAddress.startsWith("fd") ||
    normalizedAddress.startsWith("fe80:")
  ) {
    return true;
  }

  if (normalizedAddress.startsWith("172.")) {
    const secondOctet = Number.parseInt(normalizedAddress.split(".")[1] || "", 10);
    return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function isTrustedProxyAddress(remoteAddress, trustedProxies = []) {
  const normalizedRemoteAddress = normalizeIpAddress(remoteAddress);
  if (!normalizedRemoteAddress) {
    return false;
  }

  if (isPrivateOrLoopbackAddress(normalizedRemoteAddress)) {
    return true;
  }

  return trustedProxies
    .map((entry) => normalizeIpAddress(entry))
    .filter(Boolean)
    .includes(normalizedRemoteAddress);
}

function normalizeRemoteAddress(requestContext = {}, trustedProxies = []) {
  const forwardedFor = String(requestContext.forwardedFor || "")
    .split(",")[0]
    .trim();
  const remoteAddress = normalizeIpAddress(requestContext.remoteAddress);

  if (forwardedFor && isTrustedProxyAddress(remoteAddress, trustedProxies)) {
    return normalizeIpAddress(forwardedFor) || remoteAddress || "unknown";
  }

  return remoteAddress || "unknown";
}

function buildLoginThrottleKeys(username, requestContext = {}, trustedProxies = []) {
  const source = normalizeRemoteAddress(requestContext, trustedProxies);
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const keys = [`ip:${source}`];

  if (normalizedUsername) {
    keys.push(`ip:${source}:user:${normalizedUsername}`);
  }

  return keys;
}

function createLoginThrottleBucket(now, windowMs) {
  return {
    failureCount: 0,
    windowExpiresAt: now + windowMs,
    blockedUntil: 0
  };
}

function shouldResetLoginThrottleBucket(bucket, now) {
  if (!bucket) {
    return true;
  }

  if (bucket.blockedUntil && bucket.blockedUntil <= now) {
    return true;
  }

  return !bucket.blockedUntil && bucket.windowExpiresAt <= now;
}

const PASSWORD_COMPLEXITY_MESSAGE =
  "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters.";

export function createAuthService({ config, users = [], repository = null, clock = { now: () => Date.now() } }) {
  const userIndex = new Map(users.map((user) => [user.id, user]));
  const tokenIndex = new Map((config.auth.devTokens || []).map((entry) => [entry.token, toFallbackActor(entry, userIndex)]));
  const fallbackRevokedSessionIds = new Map();
  const protectedBootstrapAdmin = normalizeBootstrapAdmin(config.auth.bootstrapAdmin);
  const sessionSecret = String(config.auth.sessionSecret || "");
  const sessionCookieName = String(config.auth.sessionCookieName || "ssfs_session").trim() || "ssfs_session";
  const trustedProxies = Array.isArray(config.network?.trustedProxies)
    ? config.network.trustedProxies
    : [];
  const sessionTtlMs = Math.max(
    1,
    Number.isFinite(Number(config.auth.sessionTtlHours))
      ? Math.floor(Number(config.auth.sessionTtlHours) * 60 * 60 * 1000)
      : 12 * 60 * 60 * 1000
  );
  const loginRateLimit = normalizeLoginRateLimitConfig(config.auth.loginRateLimit || {});
  const loginThrottleState = new Map();

  if (config.auth.mode === "password" && !sessionSecret.trim()) {
    throw new Error("AUTH_SESSION_SECRET must be configured when AUTH_MODE=password.");
  }

  function getClockNow() {
    const value = Number(clock?.now?.());
    return Number.isFinite(value) ? value : Date.now();
  }

  function isProtectedBootstrapAdminUser(user) {
    const protectedUsername = String(protectedBootstrapAdmin.username || "").trim().toLowerCase();
    const currentUsername = String(user?.username || "").trim().toLowerCase();

    return Boolean(protectedUsername && currentUsername && currentUsername === protectedUsername);
  }

  function sanitizeUser(user) {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username || "",
      email: user.email || null,
      roleCode: user.roleCode,
      status: user.status,
      isProtectedAdmin: isProtectedBootstrapAdminUser(user)
    };
  }

  async function getLoginThrottleBucket(key, now) {
    const existing = repository?.readLoginThrottleBucket
      ? await repository.readLoginThrottleBucket(key)
      : loginThrottleState.get(key);
    if (shouldResetLoginThrottleBucket(existing, now)) {
      const resetBucket = createLoginThrottleBucket(now, loginRateLimit.windowMs);
      if (repository?.writeLoginThrottleBucket) {
        await repository.writeLoginThrottleBucket(key, resetBucket);
      } else {
        loginThrottleState.set(key, resetBucket);
      }
      return resetBucket;
    }

    return existing;
  }

  async function clearLoginThrottle(username, requestContext = {}) {
    const keys = buildLoginThrottleKeys(username, requestContext, trustedProxies);
    if (repository?.deleteLoginThrottleBuckets) {
      await repository.deleteLoginThrottleBuckets(keys);
      return;
    }

    for (const key of keys) {
      loginThrottleState.delete(key);
    }
  }

  async function assertLoginAllowed(username, requestContext = {}) {
    if (!loginRateLimit.enabled) {
      return;
    }

    const now = getClockNow();
    let blockedUntil = 0;

    for (const key of buildLoginThrottleKeys(username, requestContext, trustedProxies)) {
      const bucket = await getLoginThrottleBucket(key, now);
      if (bucket.blockedUntil > now) {
        blockedUntil = Math.max(blockedUntil, bucket.blockedUntil);
      }
    }

    if (blockedUntil > now) {
      throw new TooManyRequestsError(
        "Too many login attempts. Please wait before trying again.",
        Math.ceil((blockedUntil - now) / 1000)
      );
    }
  }

  async function recordFailedLogin(username, requestContext = {}) {
    if (!loginRateLimit.enabled) {
      return;
    }

    const now = getClockNow();

    for (const key of buildLoginThrottleKeys(username, requestContext, trustedProxies)) {
      const bucket = await getLoginThrottleBucket(key, now);
      bucket.failureCount += 1;

      if (bucket.failureCount >= loginRateLimit.maxAttempts) {
        bucket.blockedUntil = now + loginRateLimit.blockMs;
        bucket.windowExpiresAt = bucket.blockedUntil;
      }

      if (repository?.writeLoginThrottleBucket) {
        await repository.writeLoginThrottleBucket(key, bucket);
      } else {
        loginThrottleState.set(key, bucket);
      }
    }
  }

  async function getRepositoryUser(userId) {
    if (!repository || !userId) {
      return null;
    }

    return repository.findUserById(String(userId));
  }

  async function resolveActorFromRepositoryUser(user) {
    if (!user) {
      return null;
    }

    if (user.status !== "active") {
      return null;
    }

    return mapUserToActor(user);
  }

  async function requireAdminActor(actor) {
    if (!actor) {
      throw new UnauthorizedError();
    }

    if (actor.roleCode !== "admin") {
      throw new ForbiddenError();
    }
  }

  function validateRoleCode(roleCode) {
    if (!["admin", "reviewer", "auditor"].includes(roleCode)) {
      throw new ValidationError("Role must be one of: admin, reviewer, or auditor.");
    }
  }

  function validateUsername(username) {
    if (!username) {
      throw new ValidationError("Username is required.");
    }
  }

  function validateFullName(fullName) {
    if (!fullName) {
      throw new ValidationError("Full name is required.");
    }
  }

  function validatePassword(password) {
    if (!password) {
      throw new ValidationError("Password is required.");
    }

    if (
      password.length < 12 ||
      !/[a-z]/u.test(password) ||
      !/[A-Z]/u.test(password) ||
      !/\d/u.test(password) ||
      !/[^A-Za-z0-9]/u.test(password)
    ) {
      throw new ValidationError(PASSWORD_COMPLEXITY_MESSAGE);
    }
  }

  async function assertUsernameAvailable(username, currentUserId = null) {
    const existingUser = await repository.findUserByUsername(username);
    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictError("Username is already in use.");
    }
  }

  async function assertEmailAvailable(email, currentUserId = null) {
    if (!email) {
      return;
    }

    const existingUser = await repository.findUserByEmail(email);
    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictError("Email is already in use.");
    }
  }

  async function revokeSessionId(sessionId, expiresAt) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (normalizedSessionId) {
      if (repository?.revokeSession) {
        await repository.revokeSession(normalizedSessionId, expiresAt);
        return;
      }

      fallbackRevokedSessionIds.set(normalizedSessionId, Number(expiresAt) || 0);
    }
  }

  async function isSessionRevoked(sessionId, now = getClockNow()) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return false;
    }

    if (repository?.isSessionRevoked) {
      return repository.isSessionRevoked(normalizedSessionId, now);
    }

    const revokedUntil = fallbackRevokedSessionIds.get(normalizedSessionId);
    if (!Number.isFinite(revokedUntil) || revokedUntil <= now) {
      fallbackRevokedSessionIds.delete(normalizedSessionId);
      return false;
    }

    return true;
  }

  async function verifyPasswordSessionToken(token) {
    const claims = readSessionTokenClaims(token);
    if (!claims || claims.expiresAt <= getClockNow()) {
      return null;
    }

    const repositoryUser = await getRepositoryUser(claims.userId);
    if (!repositoryUser) {
      return null;
    }

    const verifiedClaims = verifySignedSessionToken(
      token,
      repositoryUser.passwordHash,
      sessionSecret
    );
    if (!verifiedClaims || (await isSessionRevoked(verifiedClaims.sessionId))) {
      return null;
    }

    return {
      claims: verifiedClaims,
      user: repositoryUser
    };
  }

  async function seedDevTokenUsers() {
    if (!repository || config.auth.mode !== "dev-token") {
      return;
    }

    for (const entry of config.auth.devTokens || []) {
      const normalizedEntry = normalizeDevTokenUser(entry);
      if (!normalizedEntry.username || !normalizedEntry.fullName || !normalizedEntry.roleCode) {
        continue;
      }

      let existingUser = await repository.findUserByUsername(normalizedEntry.username);
      if (!existingUser && normalizedEntry.email) {
        existingUser = await repository.findUserByEmail(normalizedEntry.email);
      }

      if (existingUser) {
        continue;
      }

      const passwordHash = await hashPassword(
        `dev-token:${normalizedEntry.token}:${normalizedEntry.userId || normalizedEntry.username}`
      );

      await repository.createUser({
        fullName: normalizedEntry.fullName,
        username: normalizedEntry.username,
        email: normalizedEntry.email || null,
        passwordHash,
        roleCode: normalizedEntry.roleCode,
        status: "active"
      });
    }
  }

  async function hydrateDevTokenActors() {
    if (!repository || config.auth.mode !== "dev-token") {
      return;
    }

    for (const entry of config.auth.devTokens || []) {
      let matchedUser = null;

      if (entry.username) {
        matchedUser = await repository.findUserByUsername(entry.username);
      }

      if (!matchedUser && entry.email) {
        matchedUser = await repository.findUserByEmail(entry.email);
      }

      tokenIndex.set(
        entry.token,
        matchedUser
          ? {
              userId: matchedUser.id,
              fullName: matchedUser.fullName,
              roleCode: matchedUser.roleCode,
              email: matchedUser.email || null
            }
          : toFallbackActor(entry, userIndex)
      );
    }
  }

  return {
    async ensureBootstrapAdmin() {
      if (!repository) {
        return null;
      }

      const bootstrapAdmin = normalizeBootstrapAdmin(config.auth.bootstrapAdmin);
      if (!bootstrapAdmin.fullName || !bootstrapAdmin.username || !bootstrapAdmin.password) {
        return null;
      }

      validatePassword(bootstrapAdmin.password);

      const existingUser = await repository.findUserByUsername(bootstrapAdmin.username);
      if (existingUser) {
        return existingUser;
      }

      const passwordHash = await hashPassword(bootstrapAdmin.password);
      return repository.createUser({
        fullName: bootstrapAdmin.fullName,
        username: bootstrapAdmin.username,
        passwordHash,
        roleCode: "admin",
        status: "active"
      });
    },
    async ensureDevTokenUsers() {
      await seedDevTokenUsers();
    },
    async hydrateDevTokenActors() {
      await hydrateDevTokenActors();
    },
    async login(credentials = {}, requestContext = {}) {
      if (!repository) {
        throw new UnauthorizedError("Login is not available until authentication setup is complete.");
      }

      const username = String(credentials.username || "").trim();
      const password = String(credentials.password || "");
      if (!username || !password) {
        throw new ValidationError("Username and password are required.");
      }

      await assertLoginAllowed(username, requestContext);

      const user = await repository.findUserByUsername(username);
      if (!user || user.status !== "active") {
        await recordFailedLogin(username, requestContext);
        throw new UnauthorizedError("Username or password is incorrect.");
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash);
      if (!passwordMatches) {
        await recordFailedLogin(username, requestContext);
        throw new UnauthorizedError("Username or password is incorrect.");
      }

      await clearLoginThrottle(username, requestContext);

      const actor = mapUserToActor(user);
      const token = createSignedSessionToken(actor, user.passwordHash, sessionSecret, sessionTtlMs);

      return {
        token,
        actor
      };
    },
    async logoutRequest(req) {
      const token =
        config.auth.mode === "password"
          ? readPasswordSessionTokenFromRequest(req, sessionCookieName)
          : parseBearerToken(req?.headers?.authorization);
      if (!token) {
        return {
          loggedOut: false
        };
      }

      const verifiedSession = await verifyPasswordSessionToken(token);
      if (!verifiedSession) {
        return {
          loggedOut: false
        };
      }

      await revokeSessionId(verifiedSession.claims.sessionId, verifiedSession.claims.expiresAt);
      return {
        loggedOut: true
      };
    },
    async listUsers(actor) {
      await requireAdminActor(actor);
      const usersList = await repository.listUsers();
      return usersList.map(sanitizeUser);
    },
    async createUser(input, actor) {
      await requireAdminActor(actor);
      const normalizedInput = normalizeUserInput(input);

      validateFullName(normalizedInput.fullName);
      validateUsername(normalizedInput.username);
      validatePassword(normalizedInput.password);
      validateRoleCode(normalizedInput.roleCode);
      await assertUsernameAvailable(normalizedInput.username);
      await assertEmailAvailable(normalizedInput.email);

      const passwordHash = await hashPassword(normalizedInput.password);
      const createdUser = await repository.createUser({
        fullName: normalizedInput.fullName,
        username: normalizedInput.username,
        email: normalizedInput.email || null,
        passwordHash,
        roleCode: normalizedInput.roleCode,
        status: normalizedInput.status
      });

      return sanitizeUser(createdUser);
    },
    async updateUser(userId, input, actor) {
      await requireAdminActor(actor);
      const currentUser = await repository.findUserById(String(userId || "").trim());
      if (!currentUser) {
        throw new NotFoundError("User account was not found.");
      }

      const normalizedInput = normalizeUserInput({
        fullName: input.fullName ?? currentUser.fullName,
        username: input.username ?? currentUser.username,
        email: input.email ?? currentUser.email,
        roleCode: input.roleCode ?? currentUser.roleCode,
        status: input.status ?? currentUser.status
      });

      validateFullName(normalizedInput.fullName);
      validateUsername(normalizedInput.username);
      validateRoleCode(normalizedInput.roleCode);
      await assertUsernameAvailable(normalizedInput.username, currentUser.id);
      await assertEmailAvailable(normalizedInput.email, currentUser.id);

      if (
        isProtectedBootstrapAdminUser(currentUser) &&
        (
          normalizedInput.username !== currentUser.username ||
          normalizedInput.roleCode !== "admin" ||
          normalizedInput.status !== "active"
        )
      ) {
        throw new ConflictError(
          "The protected admin account cannot be renamed, deactivated, or removed from the admin role."
        );
      }

      const isLastActiveAdmin =
        currentUser.roleCode === "admin" &&
        currentUser.status === "active" &&
        (normalizedInput.roleCode !== "admin" || normalizedInput.status !== "active");

      if (isLastActiveAdmin) {
        const activeAdminCount = await repository.countActiveAdmins();
        if (activeAdminCount <= 1) {
          throw new ConflictError("The last active admin account cannot be changed to inactive or removed from the admin role.");
        }
      }

      const updatedUser = await repository.updateUser(currentUser.id, normalizedInput);
      if (!updatedUser) {
        throw new NotFoundError("User account was not found.");
      }

      return sanitizeUser(updatedUser);
    },
    async resetPassword(userId, input, actor) {
      await requireAdminActor(actor);
      validatePassword(String(input.password || ""));

      const currentUser = await repository.findUserById(String(userId || "").trim());
      if (!currentUser) {
        throw new NotFoundError("User account was not found.");
      }

      const passwordHash = await hashPassword(String(input.password));
      const updatedUser = await repository.setPassword(currentUser.id, passwordHash);
      if (!updatedUser) {
        throw new NotFoundError("User account was not found.");
      }

      return {
        updated: true
      };
    },
    async deleteUser(userId, actor) {
      await requireAdminActor(actor);
      const currentUser = await repository.findUserById(String(userId || "").trim());
      if (!currentUser) {
        throw new NotFoundError("User account was not found.");
      }

      if (isProtectedBootstrapAdminUser(currentUser)) {
        throw new ConflictError("The protected admin account cannot be removed.");
      }

      const isLastActiveAdmin = currentUser.roleCode === "admin" && currentUser.status === "active";
      if (isLastActiveAdmin) {
        const activeAdminCount = await repository.countActiveAdmins();
        if (activeAdminCount <= 1) {
          throw new ConflictError("The last active admin account cannot be removed.");
        }
      }

      const deletedUser = await repository.deleteUser(currentUser.id);
      if (!deletedUser) {
        throw new NotFoundError("User account was not found.");
      }

      return {
        deleted: true,
        item: sanitizeUser(deletedUser)
      };
    },
    async resolveRequestActor(req) {
      const token =
        config.auth.mode === "password"
          ? readPasswordSessionTokenFromRequest(req, sessionCookieName)
          : parseBearerToken(req.headers.authorization);
      if (!token) {
        return null;
      }

      if (config.auth.mode === "dev-token") {
        const tokenSession = tokenIndex.get(token);
        if (!tokenSession) {
          throw new UnauthorizedError("Bearer token is invalid.");
        }

        const repositoryUser = await getRepositoryUser(tokenSession.userId);
        if (repositoryUser) {
          return resolveActorFromRepositoryUser(repositoryUser);
        }

        return {
          ...tokenSession,
          username: tokenSession.username || "",
          status: tokenSession.status || "active",
          email: tokenSession.email || userIndex.get(tokenSession.userId)?.email || null
        };
      }

      const verifiedSession = await verifyPasswordSessionToken(token);
      if (!verifiedSession) {
        throw new UnauthorizedError("Authentication session is no longer valid.");
      }

      const actor = await resolveActorFromRepositoryUser(verifiedSession.user);
      if (!actor) {
        throw new UnauthorizedError("Authentication session is no longer valid.");
      }

      return actor;
    }
  };
}
