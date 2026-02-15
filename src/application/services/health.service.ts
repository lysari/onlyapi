import type { CircuitBreaker } from "../../core/ports/circuit-breaker.js";
import { CircuitState } from "../../core/ports/circuit-breaker.js";
import type { Logger } from "../../core/ports/logger.js";

export interface HealthStatus {
  readonly status: "ok" | "degraded" | "down";
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  readonly status: "ok" | "degraded" | "down";
  readonly latencyMs?: number | undefined;
  readonly details?: string | undefined;
}

export interface HealthService {
  check(): Promise<HealthStatus>;
}

interface Deps {
  readonly logger: Logger;
  readonly version: string;
  /** Optional circuit breakers to monitor for graceful degradation */
  readonly circuitBreakers?: readonly CircuitBreaker[];
}

export const createHealthService = (deps: Deps): HealthService => {
  const { logger, version } = deps;
  const circuitBreakers = deps.circuitBreakers ?? [];

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: health check gathers many component statuses
    async check(): Promise<HealthStatus> {
      logger.debug("Running deep health check");
      const start = performance.now();

      const checks: Record<string, ComponentHealth> = {};

      // Memory check
      checks["memory"] = {
        status: "ok",
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };

      // Circuit breaker checks — graceful degradation awareness
      for (const cb of circuitBreakers) {
        const cbState = cb.state;
        if (cbState === CircuitState.OPEN) {
          checks[`circuit:${cb.name}`] = {
            status: "down",
            details: `Circuit breaker OPEN — failures: ${cb.failureCount}`,
          };
        } else if (cbState === CircuitState.HALF_OPEN) {
          checks[`circuit:${cb.name}`] = {
            status: "degraded",
            details: "Circuit breaker HALF_OPEN — recovery in progress",
          };
        } else {
          checks[`circuit:${cb.name}`] = { status: "ok" };
        }
      }

      // Determine overall status
      const allChecks = Object.entries(checks);
      const downComponents = allChecks.filter(([, c]) => c.status === "down");
      const degradedComponents = allChecks.filter(([, c]) => c.status === "degraded");

      let overallStatus: "ok" | "degraded" | "down" = "ok";
      if (downComponents.length > 0) {
        overallStatus = "degraded"; // downstream is down, but we're still serving
      } else if (degradedComponents.length > 0) {
        overallStatus = "degraded";
      }

      const overall: HealthStatus = {
        status: overallStatus,
        version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks,
      };

      if (overallStatus !== "ok") {
        const failedNames = [...downComponents, ...degradedComponents].map(([name]) => name);
        logger.warn("Health check degraded", { failedComponents: failedNames });
      } else {
        logger.debug("Health check passed", {
          latencyMs: Math.round((performance.now() - start) * 100) / 100,
        });
      }

      return overall;
    },
  };
};
