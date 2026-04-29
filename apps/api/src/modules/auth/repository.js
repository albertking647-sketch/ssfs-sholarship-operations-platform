const DEFAULT_ROLES = [
  {
    code: "admin",
    name: "Admin",
    description: "Platform administrators"
  },
  {
    code: "reviewer",
    name: "Reviewer",
    description: "Application reviewers"
  },
  {
    code: "auditor",
    name: "Auditor",
    description: "Audit officers"
  }
];

function normalizeStatus(status) {
  return status === "inactive" ? "inactive" : "active";
}

function mapUser(row) {
  const isActive = row.is_active ?? row.isActive ?? normalizeStatus(row.status) === "active";

  return {
    id: String(row.id),
    fullName: row.full_name ?? row.fullName,
    username: row.username ?? null,
    email: row.email ?? null,
    passwordHash: row.password_hash ?? row.passwordHash,
    roleCode: row.role_code ?? row.roleCode,
    status: isActive ? "active" : "inactive",
    isActive
  };
}

function cloneUser(user) {
  return {
    ...user
  };
}

function cloneLoginThrottleBucket(bucket) {
  return bucket
    ? {
        failureCount: Number(bucket.failureCount) || 0,
        windowExpiresAt: Number(bucket.windowExpiresAt) || 0,
        blockedUntil: Number(bucket.blockedUntil) || 0
      }
    : null;
}

function createSampleAuthRepository() {
  const users = [];
  const revokedSessions = new Map();
  const loginThrottleBuckets = new Map();
  let nextId = 1;

  return {
    audit: null,
    async countUsers() {
      return users.length;
    },
    async listUsers() {
      return users.map((user) => cloneUser(user));
    },
    async findUserById(userId) {
      const normalizedUserId = String(userId || "").trim();
      const match = users.find((user) => user.id === normalizedUserId);
      return match ? cloneUser(match) : null;
    },
    async findUserByUsername(username) {
      const normalizedUsername = String(username || "").trim();
      const match = users.find((user) => user.username === normalizedUsername);
      return match ? cloneUser(match) : null;
    },
    async findUserByEmail(email) {
      const normalizedEmail = String(email || "").trim();
      const match = users.find((user) => user.email === normalizedEmail);
      return match ? cloneUser(match) : null;
    },
    async countActiveAdmins() {
      return users.filter((user) => user.roleCode === "admin" && user.isActive).length;
    },
    async createUser(input) {
      const user = {
        id: String(nextId),
        fullName: input.fullName,
        username: input.username,
        email: input.email || null,
        passwordHash: input.passwordHash,
        roleCode: input.roleCode,
        status: normalizeStatus(input.status),
        isActive: normalizeStatus(input.status) === "active"
      };

      nextId += 1;
      users.push(user);

      return cloneUser(user);
    },
    async updateUser(userId, input) {
      const normalizedUserId = String(userId || "").trim();
      const index = users.findIndex((user) => user.id === normalizedUserId);
      if (index < 0) {
        return null;
      }

      users[index] = {
        ...users[index],
        fullName: input.fullName,
        username: input.username,
        email: input.email || null,
        roleCode: input.roleCode,
        status: normalizeStatus(input.status),
        isActive: normalizeStatus(input.status) === "active"
      };

      return cloneUser(users[index]);
    },
    async setPassword(userId, passwordHash) {
      const normalizedUserId = String(userId || "").trim();
      const index = users.findIndex((user) => user.id === normalizedUserId);
      if (index < 0) {
        return null;
      }

      users[index] = {
        ...users[index],
        passwordHash
      };

      return cloneUser(users[index]);
    },
    async deleteUser(userId) {
      const normalizedUserId = String(userId || "").trim();
      const index = users.findIndex((user) => user.id === normalizedUserId);
      if (index < 0) {
        return null;
      }

      const [deletedUser] = users.splice(index, 1);
      return cloneUser(deletedUser);
    },
    async revokeSession(sessionId, expiresAt) {
      revokedSessions.set(String(sessionId || "").trim(), Number(expiresAt) || 0);
    },
    async isSessionRevoked(sessionId, now = Date.now()) {
      const normalizedSessionId = String(sessionId || "").trim();
      const expiresAt = revokedSessions.get(normalizedSessionId);
      if (!Number.isFinite(expiresAt) || expiresAt <= Number(now)) {
        revokedSessions.delete(normalizedSessionId);
        return false;
      }

      return true;
    },
    async readLoginThrottleBucket(key) {
      return cloneLoginThrottleBucket(loginThrottleBuckets.get(String(key || "").trim()));
    },
    async writeLoginThrottleBucket(key, bucket) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return;
      }

      loginThrottleBuckets.set(normalizedKey, cloneLoginThrottleBucket(bucket));
    },
    async deleteLoginThrottleBuckets(keys = []) {
      for (const key of keys) {
        loginThrottleBuckets.delete(String(key || "").trim());
      }
    }
  };
}

function createPostgresAuthRepository({ database }) {
  let ensuredRoles = false;

  async function ensureRoles() {
    if (ensuredRoles) {
      return;
    }

    for (const role of DEFAULT_ROLES) {
      await database.query(
        `
          INSERT INTO roles (code, name, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description
        `,
        [role.code, role.name, role.description]
      );
    }

    ensuredRoles = true;
  }

  return {
    audit: null,
    async countUsers() {
      const result = await database.query(`
        SELECT COUNT(*)::INT AS total
        FROM users
      `);

      return result.rows[0]?.total ?? 0;
    },
    async listUsers() {
      await ensureRoles();
      const result = await database.query(`
        SELECT
          u.id::text AS id,
          u.full_name,
          u.username,
          u.email,
          u.password_hash,
          u.is_active,
          r.code AS role_code
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        ORDER BY u.created_at ASC, u.id ASC
      `);

      return result.rows.map(mapUser);
    },
    async findUserById(userId) {
      await ensureRoles();
      const result = await database.query(
        `
          SELECT
            u.id::text AS id,
            u.full_name,
            u.username,
            u.email,
            u.password_hash,
            u.is_active,
            r.code AS role_code
          FROM users u
          INNER JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1::BIGINT
          LIMIT 1
        `,
        [String(userId || "").trim()]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async findUserByUsername(username) {
      await ensureRoles();
      const result = await database.query(
        `
          SELECT
            u.id::text AS id,
            u.full_name,
            u.username,
            u.email,
            u.password_hash,
            u.is_active,
            r.code AS role_code
          FROM users u
          INNER JOIN roles r ON r.id = u.role_id
          WHERE u.username = $1
          LIMIT 1
        `,
        [String(username || "").trim()]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async findUserByEmail(email) {
      await ensureRoles();
      const result = await database.query(
        `
          SELECT
            u.id::text AS id,
            u.full_name,
            u.username,
            u.email,
            u.password_hash,
            u.is_active,
            r.code AS role_code
          FROM users u
          INNER JOIN roles r ON r.id = u.role_id
          WHERE u.email = $1
          LIMIT 1
        `,
        [String(email || "").trim()]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async countActiveAdmins() {
      await ensureRoles();
      const result = await database.query(`
        SELECT COUNT(*)::INT AS total
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'admin'
          AND u.is_active = TRUE
      `);

      return result.rows[0]?.total ?? 0;
    },
    async createUser(input) {
      await ensureRoles();
      const result = await database.query(
        `
          INSERT INTO users (
            role_id,
            full_name,
            username,
            email,
            password_hash,
            is_active
          )
          SELECT
            r.id,
            $2,
            $3,
            NULLIF($4, ''),
            $5,
            $6
          FROM roles r
          WHERE r.code = $1
          RETURNING
            id::text AS id,
            full_name,
            username,
            email,
            password_hash,
            is_active,
            (
              SELECT code
              FROM roles
              WHERE id = role_id
            ) AS role_code
        `,
        [
          input.roleCode,
          input.fullName,
          input.username,
          input.email || "",
          input.passwordHash,
          normalizeStatus(input.status) === "active"
        ]
      );

      if (!result.rows[0]) {
        throw new Error(`Cannot create auth user for unknown role code: ${input.roleCode}`);
      }

      return mapUser(result.rows[0]);
    },
    async updateUser(userId, input) {
      await ensureRoles();
      const result = await database.query(
        `
          UPDATE users AS u
          SET
            role_id = r.id,
            full_name = $3,
            username = $4,
            email = NULLIF($5, ''),
            is_active = $6,
            updated_at = NOW()
          FROM roles AS r
          WHERE u.id = $1::BIGINT
            AND r.code = $2
          RETURNING
            u.id::text AS id,
            u.full_name,
            u.username,
            u.email,
            u.password_hash,
            u.is_active,
            (
              SELECT code
              FROM roles
              WHERE id = u.role_id
            ) AS role_code
        `,
        [
          String(userId || "").trim(),
          input.roleCode,
          input.fullName,
          input.username,
          input.email || "",
          normalizeStatus(input.status) === "active"
        ]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async setPassword(userId, passwordHash) {
      const result = await database.query(
        `
          UPDATE users
          SET
            password_hash = $2,
            updated_at = NOW()
          WHERE id = $1::BIGINT
          RETURNING
            id::text AS id,
            full_name,
            username,
            email,
            password_hash,
            is_active,
            (
              SELECT code
              FROM roles
              WHERE id = role_id
            ) AS role_code
        `,
        [String(userId || "").trim(), passwordHash]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async deleteUser(userId) {
      const result = await database.query(
        `
          DELETE FROM users
          WHERE id = $1::BIGINT
          RETURNING
            id::text AS id,
            full_name,
            username,
            email,
            password_hash,
            is_active,
            (
              SELECT code
              FROM roles
              WHERE id = role_id
            ) AS role_code
        `,
        [String(userId || "").trim()]
      );

      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async revokeSession(sessionId, expiresAt) {
      await database.query(
        `
          INSERT INTO auth_revoked_sessions (
            session_id,
            expires_at
          )
          VALUES (
            $1,
            TO_TIMESTAMP($2 / 1000.0)
          )
          ON CONFLICT (session_id)
          DO UPDATE SET
            expires_at = EXCLUDED.expires_at,
            revoked_at = NOW()
        `,
        [String(sessionId || "").trim(), Number(expiresAt) || 0]
      );
    },
    async isSessionRevoked(sessionId, now = Date.now()) {
      const result = await database.query(
        `
          SELECT 1
          FROM auth_revoked_sessions
          WHERE session_id = $1
            AND expires_at > TO_TIMESTAMP($2 / 1000.0)
          LIMIT 1
        `,
        [String(sessionId || "").trim(), Number(now) || Date.now()]
      );

      return Boolean(result.rows[0]);
    },
    async readLoginThrottleBucket(key) {
      const result = await database.query(
        `
          SELECT
            failure_count,
            window_expires_at,
            blocked_until
          FROM auth_login_throttle_buckets
          WHERE bucket_key = $1
          LIMIT 1
        `,
        [String(key || "").trim()]
      );

      const row = result.rows[0];
      return row
        ? cloneLoginThrottleBucket({
            failureCount: row.failure_count,
            windowExpiresAt: row.window_expires_at,
            blockedUntil: row.blocked_until
          })
        : null;
    },
    async writeLoginThrottleBucket(key, bucket) {
      await database.query(
        `
          INSERT INTO auth_login_throttle_buckets (
            bucket_key,
            failure_count,
            window_expires_at,
            blocked_until
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (bucket_key)
          DO UPDATE SET
            failure_count = EXCLUDED.failure_count,
            window_expires_at = EXCLUDED.window_expires_at,
            blocked_until = EXCLUDED.blocked_until,
            updated_at = NOW()
        `,
        [
          String(key || "").trim(),
          Number(bucket?.failureCount) || 0,
          Number(bucket?.windowExpiresAt) || 0,
          Number(bucket?.blockedUntil) || 0
        ]
      );
    },
    async deleteLoginThrottleBuckets(keys = []) {
      const normalizedKeys = keys
        .map((key) => String(key || "").trim())
        .filter(Boolean);
      if (normalizedKeys.length === 0) {
        return;
      }

      await database.query(
        `
          DELETE FROM auth_login_throttle_buckets
          WHERE bucket_key = ANY($1::TEXT[])
        `,
        [normalizedKeys]
      );
    }
  };
}

export function createAuthRepository({ database }) {
  const repository = database.enabled
    ? createPostgresAuthRepository({ database })
    : createSampleAuthRepository();
  repository.audit = null;
  return repository;
}
