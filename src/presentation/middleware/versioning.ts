/**
 * API versioning middleware.
 *
 * Supports URL-based versioning (/api/v1/..., /api/v2/...) with:
 * - Deprecation headers on v1 endpoints
 * - API-Version response header
 * - Sunset date for v1 (configurable)
 */

/** Sunset date for v1 — 6 months from v2.0 release */
const V1_SUNSET = "2025-12-31";

/**
 * Add API version headers to a response.
 * - `API-Version`: which version served the request (v1 or v2)
 * - `Deprecation`: added to v1 responses
 * - `Sunset`: when v1 will be removed
 * - `Link`: points to v2 equivalent for v1 calls
 */
export const addVersionHeaders = (
  response: Response,
  version: "v1" | "v2",
  v2Path?: string,
): Response => {
  response.headers.set("API-Version", version);

  if (version === "v1") {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", V1_SUNSET);
    if (v2Path) {
      response.headers.set("Link", `<${v2Path}>; rel="successor-version"`);
    }
  }

  return response;
};

/**
 * Resolve the effective API version from a request.
 * Priority:
 * 1. URL path (/api/v1/ vs /api/v2/)
 * 2. Accept-Version header
 * 3. Default: v2
 */
export const resolveApiVersion = (path: string, req: Request): "v1" | "v2" => {
  if (path.startsWith("/api/v1/")) return "v1";
  if (path.startsWith("/api/v2/")) return "v2";

  const acceptVersion = req.headers.get("Accept-Version");
  if (acceptVersion === "v1" || acceptVersion === "1") return "v1";

  return "v2";
};

/**
 * Rewrite a v2 path to v1 for internal routing when handlers are shared.
 * /api/v2/auth/login → /api/v1/auth/login
 */
export const normalizeVersionedPath = (
  path: string,
): { normalized: string; version: "v1" | "v2" } => {
  if (path.startsWith("/api/v2/")) {
    return { normalized: `/api/v1/${path.substring(8)}`, version: "v2" };
  }
  if (path.startsWith("/api/v1/")) {
    return { normalized: path, version: "v1" };
  }
  return { normalized: path, version: "v2" };
};
