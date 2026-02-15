import type { AppConfig } from "../../infrastructure/config/config.js";

/**
 * Security headers — equivalent to helmet but zero deps.
 * Applied to every response.
 */
export const securityHeaders = (_config: AppConfig): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Permitted-Cross-Domain-Policies": "none",
});
