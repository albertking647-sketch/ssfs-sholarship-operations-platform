function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return !["false", "0", "no"].includes(String(value).trim().toLowerCase());
}

export function buildDatabaseSslOptions(config, env = process.env) {
  if (config.sslMode !== "require") {
    return undefined;
  }

  const allowInvalidCertificates =
    typeof config.allowInvalidCertificates === "boolean"
      ? config.allowInvalidCertificates
      : parseBoolean(env.PG_ALLOW_INVALID_CERTS, false);
  return {
    rejectUnauthorized: !allowInvalidCertificates
  };
}

export function createPoolErrorHandler(logger = console) {
  return (error) => {
    logger.error("Database pool error", error);
  };
}

function isTransientDatabaseQueryError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "");

  return (
    /control plane request failed/i.test(message) ||
    /terminating connection due to administrator command/i.test(message) ||
    code === "57P01"
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function createDatabaseClient(config, dependencies = {}) {
  if (config.runtime?.isProduction && (!config.enabled || !config.url)) {
    throw new Error("DATABASE_URL must be configured for production startup.");
  }

  if (!config.enabled || !config.url) {
    return {
      enabled: false,
      async query() {
        throw new Error("Database access is not available because DATABASE_URL is not configured.");
      },
      async withTransaction(run) {
        return run({
          async query() {
            throw new Error("Database transactions are unavailable in sample mode.");
          }
        });
      },
      async healthCheck() {
        return {
          mode: "sample",
          status: "ready"
        };
      },
      async close() {}
    };
  }

  const logger = dependencies.logger || console;
  let pgModule = dependencies.pgModule || null;

  if (!pgModule) {
    try {
      pgModule = await import("pg");
    } catch {
      throw new Error(
        "DATABASE_URL is configured but the `pg` package is not installed. Run `npm install` from the project root."
      );
    }
  }

  const { Pool } = pgModule.default?.Pool ? pgModule.default : pgModule;
  const pool = new Pool({
    connectionString: config.url,
    ssl: buildDatabaseSslOptions(config)
  });
  pool.on("error", createPoolErrorHandler(logger));

  return {
    enabled: true,
    async query(text, params = []) {
      let attempt = 0;
      while (true) {
        try {
          return await pool.query(text, params);
        } catch (error) {
          if (attempt >= 1 || !isTransientDatabaseQueryError(error)) {
            throw error;
          }

          attempt += 1;
          await delay(150);
        }
      }
    },
    async withTransaction(run) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await run({
          query(text, params = []) {
            return client.query(text, params);
          }
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async healthCheck() {
      await pool.query("SELECT 1");
      return {
        mode: "postgres",
        status: "ready"
      };
    },
    async close() {
      await pool.end();
    }
  };
}
