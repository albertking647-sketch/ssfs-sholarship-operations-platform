function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return !["false", "0", "no"].includes(String(value).trim().toLowerCase());
}

function normalizeMode(mode) {
  const value = String(mode || "development").trim().toLowerCase();
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

function buildRuntime(mode) {
  const normalizedMode = normalizeMode(mode);
  return {
    mode: normalizedMode,
    isDevelopment: normalizedMode === "development",
    isTest: normalizedMode === "test",
    isProduction: normalizedMode === "production"
  };
}

export function createRuntimeDescriptor(mode = "development") {
  return buildRuntime(mode);
}

function collectTrustedNetworks(configTrustedNetworks = [], explicitTrustedNetworks = null) {
  if (Array.isArray(explicitTrustedNetworks)) {
    return explicitTrustedNetworks.filter(Boolean);
  }

  if (Array.isArray(configTrustedNetworks)) {
    return configTrustedNetworks.filter(Boolean);
  }

  return [];
}

function throwIfProductionErrors(runtime, errors) {
  if (!runtime.isProduction || errors.length === 0) {
    return;
  }

  throw new Error(errors.join(" "));
}

export function assertApiRuntimeSecurity({
  runtime = createRuntimeDescriptor("development"),
  config = {},
  tlsConfig = {},
  env = {},
  databaseHealth = null,
  runtimeState = null
} = {}) {
  const errors = [];
  const trustedNetworks = collectTrustedNetworks(config.network?.trustedNetworks);
  const databaseEnabled = Boolean(config.database?.enabled && config.database?.url);
  const sampleMode =
    runtimeState?.dataSource === "sample" ||
    (!runtimeState && !databaseEnabled);

  if (runtime.isProduction) {
    if (!databaseEnabled) {
      errors.push("Production startup requires DATABASE_URL and PostgreSQL persistence.");
    }
    if (config.auth?.mode !== "password") {
      errors.push("Production startup requires AUTH_MODE=password.");
    }
    if (!String(config.auth?.sessionSecret || "").trim()) {
      errors.push("Production startup requires AUTH_SESSION_SECRET.");
    }
    if (!tlsConfig.enabled) {
      errors.push("Production startup requires TLS for the API.");
    }
    if (trustedNetworks.length === 0) {
      errors.push("Production startup requires trusted networks for the API.");
    }
    if (parseBoolean(env.PG_ALLOW_INVALID_CERTS, false)) {
      errors.push("Production startup rejects invalid cert bypass for PostgreSQL.");
    }
    if (parseBoolean(env.API_PROXY_ALLOW_INVALID_CERTS, false)) {
      errors.push("Production startup rejects invalid cert bypass for the web proxy.");
    }
    if (sampleMode) {
      errors.push("Production startup cannot run in sample mode.");
    }
    if (
      databaseHealth &&
      (
        databaseHealth.status !== "ready" ||
        (databaseHealth.mode && databaseHealth.mode !== "postgres")
      )
    ) {
      errors.push("Production startup requires a healthy PostgreSQL connection.");
    }
  }

  throwIfProductionErrors(runtime, errors);
}

export function assertWebRuntimeSecurity({
  runtime = createRuntimeDescriptor("development"),
  trustedNetworks = [],
  tlsConfig = {},
  env = {}
} = {}) {
  const errors = [];
  const normalizedTrustedNetworks = collectTrustedNetworks([], trustedNetworks);

  if (runtime.isProduction) {
    if (!tlsConfig.enabled) {
      errors.push("Production startup requires TLS for the web shell.");
    }
    if (normalizedTrustedNetworks.length === 0) {
      errors.push("Production startup requires trusted networks for the web shell.");
    }
    if (parseBoolean(env.API_PROXY_ALLOW_INVALID_CERTS, false)) {
      errors.push("Production startup rejects invalid cert bypass for the API proxy.");
    }
  }

  throwIfProductionErrors(runtime, errors);
}
