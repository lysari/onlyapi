/**
 * Prometheus metrics HTTP handler — serves `GET /metrics` in text exposition format.
 */

import type { MetricsCollector } from "../../core/ports/metrics.js";

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export const metricsHandler = (metrics: MetricsCollector) => {
  const headers = new Headers({
    "Content-Type": CONTENT_TYPE,
    "Cache-Control": "no-store",
  });

  const serve = (): Response => {
    const body = metrics.serialize();
    return new Response(body, { status: 200, headers });
  };

  return { serve };
};
