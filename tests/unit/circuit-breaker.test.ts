import { describe, it, expect } from "bun:test";
import { CircuitState } from "../../src/core/ports/circuit-breaker.js";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
} from "../../src/infrastructure/resilience/circuit-breaker.js";

describe("Circuit Breaker", () => {
  it("starts in CLOSED state", () => {
    const cb = createCircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
    });
    expect(cb.state).toBe(CircuitState.CLOSED);
    expect(cb.name).toBe("test");
    expect(cb.failureCount).toBe(0);
  });

  it("allows calls in CLOSED state", async () => {
    const cb = createCircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
    });

    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("transitions to OPEN after reaching failure threshold", async () => {
    const stateChanges: string[] = [];
    const cb = createCircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
      onStateChange: (_name, _from, to) => stateChanges.push(to),
    });

    const fail = () => cb.execute(() => Promise.reject(new Error("fail")));

    // First 2 failures keep it CLOSED
    await fail().catch(() => {});
    await fail().catch(() => {});
    expect(cb.state).toBe(CircuitState.CLOSED);

    // 3rd failure opens it
    await fail().catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);
    expect(stateChanges).toContain(CircuitState.OPEN);
  });

  it("rejects calls when OPEN with CircuitBreakerOpenError", async () => {
    const cb = createCircuitBreaker({
      name: "test-open",
      failureThreshold: 1,
      resetTimeoutMs: 60000, // long timeout, won't transition
      halfOpenSuccessThreshold: 1,
    });

    // Trigger open
    await cb.execute(() => Promise.reject(new Error("boom"))).catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);

    // Should reject
    try {
      await cb.execute(() => Promise.resolve("should not reach"));
      expect(true).toBe(false); // should not get here
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitBreakerOpenError);
      expect((err as CircuitBreakerOpenError).circuitName).toBe("test-open");
    }
  });

  it("transitions OPEN → HALF_OPEN after reset timeout", async () => {
    const cb = createCircuitBreaker({
      name: "test-halfopen",
      failureThreshold: 1,
      resetTimeoutMs: 50, // 50ms timeout
      halfOpenSuccessThreshold: 1,
    });

    // Open the circuit
    await cb.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);

    // Wait for reset timeout
    await Bun.sleep(60);
    expect(cb.state).toBe(CircuitState.HALF_OPEN);
  });

  it("transitions HALF_OPEN → CLOSED after enough successes", async () => {
    const cb = createCircuitBreaker({
      name: "test-recovery",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    // Open the circuit
    await cb.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    await Bun.sleep(60);
    expect(cb.state).toBe(CircuitState.HALF_OPEN);

    // 2 successes should close it
    await cb.execute(() => Promise.resolve("ok1"));
    await cb.execute(() => Promise.resolve("ok2"));
    expect(cb.state).toBe(CircuitState.CLOSED);
  });

  it("transitions HALF_OPEN → OPEN on failure", async () => {
    const cb = createCircuitBreaker({
      name: "test-relapse",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    // Open, then wait for half-open
    await cb.execute(() => Promise.reject(new Error("fail1"))).catch(() => {});
    await Bun.sleep(60);
    expect(cb.state).toBe(CircuitState.HALF_OPEN);

    // Fail in half-open → should go back to OPEN
    await cb.execute(() => Promise.reject(new Error("fail2"))).catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);
  });

  it("reset() returns to CLOSED state", async () => {
    const cb = createCircuitBreaker({
      name: "test-reset",
      failureThreshold: 1,
      resetTimeoutMs: 60000,
      halfOpenSuccessThreshold: 1,
    });

    // Open the circuit
    await cb.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.state).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.state).toBe(CircuitState.CLOSED);
    expect(cb.failureCount).toBe(0);
  });

  it("resets failure count on success in CLOSED state", async () => {
    const cb = createCircuitBreaker({
      name: "test-reset-count",
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 1,
    });

    // 2 failures, then a success
    await cb.execute(() => Promise.reject(new Error("f1"))).catch(() => {});
    await cb.execute(() => Promise.reject(new Error("f2"))).catch(() => {});
    expect(cb.failureCount).toBe(2);

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.failureCount).toBe(0);
  });
});
