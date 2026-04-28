import { HARDENING_HEADERS } from "./httpSecurityHeaders.js";

export function buildVercelConfig() {
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    buildCommand: "node scripts/build-vercel.js",
    headers: [
      {
        source: "/(.*)",
        headers: HARDENING_HEADERS
      }
    ],
    rewrites: [
      {
        source: "/health",
        destination: "/api?__pathname=/health"
      },
      {
        source: "/api",
        destination: "/api?__pathname=/api"
      },
      {
        source: "/api/:path*",
        destination: "/api?__pathname=/api/:path*"
      }
    ]
  };
}
