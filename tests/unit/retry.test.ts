import { describe, expect, it } from "bun:test";
import { createRetryPolicy } from "../../src/infrastructure/resilience/retry.js";

describe("Retry with Backoff", () => {
  it("succeeds on first attempt without retrying", async () => {
    let attempts = 0;
    const policy = createRetryPolicy({
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitter: 0,
    });

    const result = await policy.execute(() => {
      attempts++;
      return Promise.resolve("ok");
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on failure and succeeds on subsequent attempt", async () => {
    let attempts = 0;
    const policy = createRetryPolicy({
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitter: 0,
    });

    const result = await policy.execute(() => {
      attempts++;
      if (attempts < 3) return Promise.reject(new Error(`fail-${attempts}`));
      return Promise.resolve("recovered");
    });

    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  it("throws after exhausting all retries", async () => {
    let attempts = 0;
    const policy = createRetryPolicy({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitter: 0,
    });

    try {
      await policy.execute(() => {
        attempts++;
        return Promise.reject(new Error("always-fail"));
      });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect((err as Error).message).toBe("always-fail");
    }

    expect(attempts).toBe(3); // initial + 2 retries
  });

  it("respects retryable predicate — does not retry non-retryable errors", async () => {
    let attempts = 0;
    const policy = createRetryPolicy({
      maxRetries: 5,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitter: 0,
      retryable: (err) => (err as Error).message !== "fatal",
    });

    try {
      await policy.execute(() => {
        attempts++;
        return Promise.reject(new Error("fatal"));
      });
    } catch {
      // expected
    }

    expect(attempts).toBe(1); // no retries for non-retryable error
  });

  it("calls onRetry callback on each retry", async () => {
    const retries: Array<{ attempt: number; error: string; delay: number }> = [];
    let attempts = 0;

    const policy = createRetryPolicy({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitter: 0,
      onRetry: (attempt, error, delay) => {
        retries.push({
          attempt,
          error: (error as Error).message,
          delay,
        });
      },
    });

    try {
      await policy.execute(() => {
        attempts++;
        return Promise.reject(new Error(`err-${attempts}`));
      });
    } catch {
      // expected
    }

    expect(retries.length).toBe(2);
    expect(retries[0]?.attempt).toBe(1);
    expect(retries[0]?.error).toBe("err-1");
    expect(retries[1]?.attempt).toBe(2);
  });

  it("caps delay at maxDelayMs", async () => {
    const delays: number[] = [];
    let attempts = 0;

    const policy = createRetryPolicy({
      maxRetries: 5,
      baseDelayMs: 50,
      maxDelayMs: 100, // caps at 100ms
      jitter: 0, // no jitter so delay is predictable
      onRetry: (_attempt, _err, delay) => {
        delays.push(delay);
      },
    });

    try {
      await policy.execute(() => {
        attempts++;
        return Promise.reject(new Error("fail"));
      });
    } catch {
      // expected
    }

    // With baseDelay=50, delays should be: 50, 100, 100, 100, 100
    // (50*2^0=50, 50*2^1=100, capped at 100 for the rest)
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(100);
    }
    // First delay should be exactly 50 (50 * 2^0)
    expect(delays[0]).toBe(50);
  });
});
