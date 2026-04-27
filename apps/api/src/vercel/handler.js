import { createApp } from "../app.js";
import { createRuntime } from "../bootstrap/createRuntime.js";
import { config } from "../config.js";

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
        return createAppFn(runtime);
      })();
    }

    req.url = resolveVercelRequestUrl(req.url || "/");
    const app = await appPromise;
    return app(req, res);
  };
}

export default createVercelApiHandler();
