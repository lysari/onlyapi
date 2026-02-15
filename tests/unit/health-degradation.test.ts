import { describe, expect, it } from "bun:test";
import { createHealthService } from "../../src/application/services/health.service.js";
import { CircuitState } from "../../src/core/ports/circuit-breaker.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";
import { createCircuitBreaker } from "../../src/infrastructure/resilience/circuit-breaker.js";

describe("Graceful Degradation", () => {
  const logger = createLogger("error"); // quiet

  it("reports ok when no circuit breakers registered", async () => {
    const hs = createHealthService({ logger, version: "test" });
    const status = await hs.check();
    expect(status.status).toBe("ok");
  });

  it("reports ok when all circuit breakers are CLOSED", async () => {
    const cb = createCircuitBreaker({
      name: "db",
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenSuccessThreshold: 2,
    });

    const hs = createHealthService({ logger, version: "test", circuitBreakers: [cb] });
    const status = await hs.check();
    expect(status.status).toBe("ok");
    expect(status.checks["circuit:db"]?.status).toBe("ok");
  });

  it("reports degraded when a circuit breaker is OPEN", async () => {
    const cb = createCircuitBreaker({
      name: "db",
      failureThreshold: 1,
      resetTimeoutMs: 60000,
      halfOpenSuccessThreshold: 1,
    });

    // Open the circuit
    await cb.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);

    const hs = createHealthService({ logger, version: "test", circuitBreakers: [cb] });
    const status = await hs.check();
    expect(status.status).toBe("degraded");
    expect(status.checks["circuit:db"]?.status).toBe("down");
    expect(status.checks["circuit:db"]?.details).toContain("OPEN");
  });

  it("reports degraded when a circuit breaker is HALF_OPEN", async () => {
    const cb = createCircuitBreaker({
      name: "api",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    // Open then wait for half-open
    await cb.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    await Bun.sleep(60);
    expect(cb.state).toBe(CircuitState.HALF_OPEN);

    const hs = createHealthService({ logger, version: "test", circuitBreakers: [cb] });
    const status = await hs.check();
    expect(status.status).toBe("degraded");
    expect(status.checks["circuit:api"]?.status).toBe("degraded");
    expect(status.checks["circuit:api"]?.details).toContain("HALF_OPEN");
  });

  it("includes version and uptime in health status", async () => {
    const hs = createHealthService({ logger, version: "1.3.0" });
    const status = await hs.check();
    expect(status.version).toBe("1.3.0");
    expect(status.uptime).toBeGreaterThan(0);
    expect(status.timestamp).toBeTruthy();
  });
});
