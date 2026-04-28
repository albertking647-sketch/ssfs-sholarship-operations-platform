import { createApp } from "../app.js";
import { createRuntime } from "../bootstrap/createRuntime.js";
import { config } from "../config.js";
import {
  buildTrustedNetworkRules,
  enforceTrustedNetworkAccess
} from "../../../../scripts/networkAccess.js";

export function resolveVercelRequestUrl(requestUrl = "/") {
  const url = new URL(String(requestUrl || "/"), "http://localhost");
  const pathnameOverride = url.searchParams.get("__pathname");
  if (!pathnameOverride) {
    return `${url.pathname}${url.search}`;
  }

  url.searchParams.delete("__pathname");
  const search = url.searchParams.toString();
  return `${pathnameOverride}${search ? `?${search}` : ""}`;
}

export function createVercelApiHandler({
  configValue = config,
  createRuntimeFn = createRuntime,
  createAppFn = createApp
} = {}) {
  let appPromise;

  return async function handler(req, res) {
    if (!appPromise) {
      appPromise = (async () => {
        const runtime = await createRuntimeFn(configValue);
        return {
          app: createAppFn(runtime),
          trustedNetworkRules: buildTrustedNetworkRules(runtime.config.network?.trustedNetworks || [])
        };
      })();
    }

    const { app, trustedNetworkRules } = await appPromise;
    const access = enforceTrustedNetworkAccess(req, res, trustedNetworkRules, {
      trustProxyHeaders: true
    });
    if (!access.allowed) {
      return;
    }

    req.url = resolveVercelRequestUrl(req.url || "/");
    return app(req, res);
  };
}

export default createVercelApiHandler();
