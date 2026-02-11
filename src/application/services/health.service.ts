import type { Logger } from "../../core/ports/logger.js";

export interface HealthStatus {
  readonly status: "ok" | "degraded" | "down";
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  readonly status: "ok" | "down";
  readonly latencyMs?: number | undefined;
}

export interface HealthService {
  check(): Promise<HealthStatus>;
}

interface Deps {
  readonly logger: Logger;
  readonly version: string;
}

export const createHealthService = (deps: Deps): HealthService => {
  const { logger, version } = deps;

  return {
    async check(): Promise<HealthStatus> {
      logger.debug("Running deep health check");
      const start = performance.now();

      // Add real checks here (DB ping, cache ping, etc.)
      const memoryCheck: ComponentHealth = {
        status: "ok",
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };

      const overall: HealthStatus = {
        status: "ok",
        version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks: {
          memory: memoryCheck,
        },
      };

      const failed = Object.entries(overall.checks).filter(([, c]) => c.status !== "ok");
      if (failed.length > 0) {
        logger.warn("Health check degraded", {
          failedComponents: failed.map(([name]) => name),
        });
      } else {
        logger.debug("Health check passed", {
          latencyMs: Math.round((performance.now() - start) * 100) / 100,
        });
      }

      return overall;
    },
  };
};
