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

function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError("Authorization header must use the Bearer scheme.");
  }

  return token.trim();
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

function normalizeRemoteAddress(requestContext = {}) {
  const forwardedFor = String(requestContext.forwardedFor || "")
    .split(",")[0]
    .trim();
  const remoteAddress = String(requestContext.remoteAddress || "").trim();

  return forwardedFor || remoteAddress || "unknown";
}

function buildLoginThrottleKeys(username, requestContext = {}) {
  const source = normalizeRemoteAddress(requestContext);
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

export function createAuthService({ config, users = [], repository = null, clock = { now: () => Date.now() } }) {
  const userIndex = new Map(users.map((user) => [user.id, user]));
  const tokenIndex = new Map((config.auth.devTokens || []).map((entry) => [entry.token, toFallbackActor(entry, userIndex)]));
  const revokedSessionIds = new Set();
  const protectedBootstrapAdmin = normalizeBootstrapAdmin(config.auth.bootstrapAdmin);
  const sessionSecret = String(config.auth.sessionSecret || "");
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

  function getLoginThrottleBucket(key, now) {
    const existing = loginThrottleState.get(key);
    if (shouldResetLoginThrottleBucket(existing, now)) {
      const resetBucket = createLoginThrottleBucket(now, loginRateLimit.windowMs);
      loginThrottleState.set(key, resetBucket);
      return resetBucket;
    }

    return existing;
  }

  function clearLoginThrottle(username, requestContext = {}) {
    for (const key of buildLoginThrottleKeys(username, requestContext)) {
      loginThrottleState.delete(key);
    }
  }

  function assertLoginAllowed(username, requestContext = {}) {
    if (!loginRateLimit.enabled) {
      return;
    }

    const now = getClockNow();
    let blockedUntil = 0;

    for (const key of buildLoginThrottleKeys(username, requestContext)) {
      const bucket = getLoginThrottleBucket(key, now);
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

  function recordFailedLogin(username, requestContext = {}) {
    if (!loginRateLimit.enabled) {
      return;
    }

    const now = getClockNow();

    for (const key of buildLoginThrottleKeys(username, requestContext)) {
      const bucket = getLoginThrottleBucket(key, now);
      bucket.failureCount += 1;

      if (bucket.failureCount >= loginRateLimit.maxAttempts) {
        bucket.blockedUntil = now + loginRateLimit.blockMs;
        bucket.windowExpiresAt = bucket.blockedUntil;
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

  function revokeSessionId(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (normalizedSessionId) {
      revokedSessionIds.add(normalizedSessionId);
    }
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

      assertLoginAllowed(username, requestContext);

      const user = await repository.findUserByUsername(username);
      if (!user || user.status !== "active") {
        recordFailedLogin(username, requestContext);
        throw new UnauthorizedError("Username or password is incorrect.");
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash);
      if (!passwordMatches) {
        recordFailedLogin(username, requestContext);
        throw new UnauthorizedError("Username or password is incorrect.");
      }

      clearLoginThrottle(username, requestContext);

      const actor = mapUserToActor(user);
      const token = createSignedSessionToken(actor, user.passwordHash, sessionSecret, sessionTtlMs);

      return {
        token,
        actor
      };
    },
    async logoutRequest(req) {
      const token = parseBearerToken(req?.headers?.authorization);
      if (!token) {
        return {
          loggedOut: false
        };
      }

      const claims = readSessionTokenClaims(token);
      if (!claims) {
        return {
          loggedOut: false
        };
      }

      const repositoryUser = await getRepositoryUser(claims.userId);
      if (!repositoryUser) {
        return {
          loggedOut: false
        };
      }

      const verifiedClaims = verifySignedSessionToken(
        token,
        repositoryUser.passwordHash,
        sessionSecret
      );
      if (!verifiedClaims) {
        return {
          loggedOut: false
        };
      }

      revokeSessionId(verifiedClaims.sessionId);
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
      const token = parseBearerToken(req.headers.authorization);
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

      const claims = readSessionTokenClaims(token);
      if (!claims) {
        throw new UnauthorizedError("Bearer token is invalid.");
      }

      const repositoryUser = await getRepositoryUser(claims.userId);
      if (!repositoryUser) {
        throw new UnauthorizedError("Authentication session is no longer valid.");
      }

      const verifiedClaims = verifySignedSessionToken(
        token,
        repositoryUser.passwordHash,
        sessionSecret
      );
      if (!verifiedClaims || revokedSessionIds.has(verifiedClaims.sessionId)) {
        throw new UnauthorizedError("Authentication session is no longer valid.");
      }

      const actor = await resolveActorFromRepositoryUser(repositoryUser);
      if (!actor) {
        throw new UnauthorizedError("Authentication session is no longer valid.");
      }

      return actor;
    }
  };
}
