import assert from "node:assert/strict";

import {
  buildDatabaseSslOptions,
  createDatabaseClient
} from "../src/infra/database/client.js";

function sslOptionsRejectInvalidCertificatesByDefault() {
  assert.deepEqual(
    buildDatabaseSslOptions({ sslMode: "require" }, {}),
    {
      rejectUnauthorized: true
    }
  );
}

async function databaseClientRegistersPoolErrorHandler() {
  const loggedErrors = [];

  class MockPool {
    static instance = null;

    constructor(options) {
      this.options = options;
      this.handlers = new Map();
      MockPool.instance = this;
    }

    on(eventName, handler) {
      this.handlers.set(eventName, handler);
    }

    async query() {
      return { rows: [] };
    }

    async end() {}
  }

  const client = await createDatabaseClient(
    {
      enabled: true,
      url: "postgres://example.test/mock",
      sslMode: "require"
    },
    {
      pgModule: { Pool: MockPool },
      logger: {
        error(...args) {
          loggedErrors.push(args);
        }
      }
    }
  );

  assert.ok(MockPool.instance);
  assert.equal(typeof MockPool.instance.handlers.get("error"), "function");
  assert.deepEqual(MockPool.instance.options.ssl, { rejectUnauthorized: true });

  const poolError = new Error("simulated idle client failure");
  MockPool.instance.handlers.get("error")(poolError);

  assert.equal(loggedErrors.length, 1);
  assert.match(String(loggedErrors[0][0]), /database pool error/i);
  assert.equal(loggedErrors[0][1], poolError);

  await client.close();
}

async function databaseClientRetriesTransientControlPlaneFailure() {
  let queryCalls = 0;

  class MockPool {
    constructor() {}

    on() {}

    async query() {
      queryCalls += 1;
      if (queryCalls === 1) {
        const error = new Error("Control plane request failed");
        error.code = "XX000";
        throw error;
      }

      return { rows: [{ ok: true }] };
    }

    async end() {}
  }

  const client = await createDatabaseClient(
    {
      enabled: true,
      url: "postgres://example.test/mock",
      sslMode: "require"
    },
    {
      pgModule: { Pool: MockPool },
      logger: console
    }
  );

  const result = await client.query("SELECT 1");

  assert.equal(queryCalls, 2);
  assert.deepEqual(result.rows, [{ ok: true }]);

  await client.close();
}

sslOptionsRejectInvalidCertificatesByDefault();
await databaseClientRegistersPoolErrorHandler();
await databaseClientRetriesTransientControlPlaneFailure();

console.log("database-client-tests: ok");
