import type { AppConfig } from "../../infrastructure/config/config.js";

/**
 * CORS handling — origin validation, preflight support.
 * Returns headers to merge, or null if origin is rejected.
 */
export const corsHeaders = (
  config: AppConfig,
  requestOrigin: string | null,
  _method: string,
): Record<string, string> | null => {
  const allowedOrigins = config.cors.origins;

  // If wildcard, allow everything
  const isAllowed =
    allowedOrigins.includes("*") || (requestOrigin !== null && allowedOrigins.includes(requestOrigin));

  if (!isAllowed && requestOrigin !== null) return null;

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": requestOrigin ?? "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  return headers;
};

/** Returns a 204 preflight response or null if not a preflight */
export const handlePreflight = (
  config: AppConfig,
  req: Request,
): Response | null => {
  if (req.method !== "OPTIONS") return null;

  const origin = req.headers.get("origin");
  const headers = corsHeaders(config, origin, req.method);
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
};
