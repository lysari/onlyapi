import type { HealthService } from "../../application/services/health.service.js";

/**
 * Health handler with two modes:
 * - Deep check: full service health (for /readiness)
 * - Shallow check: pre-serialized instant response (for /health and load balancer probes)
 */
export const healthHandler = (healthService: HealthService) => {
  /** Pre-serialized shallow health — zero JSON.stringify per request */
  const shallowHeaders = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });

  const deepCheck = async (): Promise<Response> => {
    const status = await healthService.check();
    const httpCode = status.status === "ok" ? 200 : 503;
    return Response.json({ data: status }, { status: httpCode });
  };

  const shallowCheck = (): Response => {
    // Ultra-fast: pre-built body, avoids JSON.stringify + async overhead
    const body = `{"data":{"status":"ok","uptime":${process.uptime()}}}`;
    return new Response(body, { status: 200, headers: shallowHeaders });
  };

  return { deepCheck, shallowCheck };
};
