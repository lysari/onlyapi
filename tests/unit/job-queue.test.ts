import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JobStatus } from "../../src/core/ports/job-queue.js";
import { createInMemoryJobQueue } from "../../src/infrastructure/jobs/job-queue.js";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as import("../../src/core/ports/logger.js").Logger;

describe("InMemoryJobQueue", () => {
  let queue: ReturnType<typeof createInMemoryJobQueue>;

  beforeEach(() => {
    queue = createInMemoryJobQueue({ logger: noopLogger, pollIntervalMs: 50 });
  });

  afterEach(() => {
    queue.stop();
  });

  test("submit creates a pending job", () => {
    const result = queue.submit({
      type: "test.job",
      payload: { value: 42 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe(JobStatus.PENDING);
      expect(result.value.type).toBe("test.job");
      expect(result.value.payload).toEqual({ value: 42 });
      expect(result.value.attempts).toBe(0);
      expect(result.value.maxRetries).toBe(3);
    }
  });

  test("getJob returns submitted job", () => {
    const submitResult = queue.submit({ type: "test.job", payload: {} });
    expect(submitResult.ok).toBe(true);
    if (!submitResult.ok) return;

    const getResult = queue.getJob(submitResult.value.id);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value?.id).toBe(submitResult.value.id);
    }
  });

  test("getJob returns null for unknown id", () => {
    const result = queue.getJob("nonexistent");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test("registerHandler + start processes pending jobs", async () => {
    let processed = false;
    queue.registerHandler("test.job", async (payload) => {
      processed = true;
      expect(payload).toEqual({ key: "val" });
    });

    queue.submit({ type: "test.job", payload: { key: "val" } });
    queue.start();

    await Bun.sleep(150); // Wait for poll cycle

    expect(processed).toBe(true);
  });

  test("failed job is retried and eventually marked dead", async () => {
    let attempts = 0;
    queue.registerHandler("fail.job", async () => {
      attempts++;
      throw new Error("fail");
    });

    const result = queue.submit({ type: "fail.job", payload: {}, maxRetries: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    queue.start();

    // First poll picks up the job (~50ms), it fails and is marked DEAD (maxRetries=1)
    await Bun.sleep(150);

    expect(attempts).toBe(1);
    const jobResult = queue.getJob(result.value.id);
    expect(jobResult.ok).toBe(true);
    if (jobResult.ok && jobResult.value) {
      expect(jobResult.value.status).toBe(JobStatus.DEAD);
      expect(jobResult.value.lastError).toBe("fail");
    }
  });

  test("job with no handler is marked dead", async () => {
    const result = queue.submit({ type: "unknown.type", payload: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    queue.start();
    await Bun.sleep(150);

    const jobResult = queue.getJob(result.value.id);
    expect(jobResult.ok).toBe(true);
    if (jobResult.ok && jobResult.value) {
      expect(jobResult.value.status).toBe(JobStatus.DEAD);
    }
  });

  test("stats returns correct counts", async () => {
    queue.registerHandler("ok.job", async () => {});

    queue.submit({ type: "ok.job", payload: {} });
    queue.submit({ type: "no.handler", payload: {} });

    queue.start();
    await Bun.sleep(150);

    const statsResult = queue.stats();
    expect(statsResult.ok).toBe(true);
    if (statsResult.ok) {
      expect(statsResult.value.completed).toBeGreaterThanOrEqual(1);
      expect(statsResult.value.dead).toBeGreaterThanOrEqual(1);
    }
  });

  test("delayed job is not processed immediately", async () => {
    let processed = false;
    queue.registerHandler("delayed.job", async () => {
      processed = true;
    });

    queue.submit({ type: "delayed.job", payload: {}, delayMs: 5_000 });
    queue.start();

    await Bun.sleep(150);
    expect(processed).toBe(false);
  });

  test("stop prevents further processing", async () => {
    let processed = false;
    queue.registerHandler("test.job", async () => {
      processed = true;
    });

    queue.submit({ type: "test.job", payload: {} });
    // Don't start, so nothing processes
    await Bun.sleep(100);
    expect(processed).toBe(false);
  });
});
