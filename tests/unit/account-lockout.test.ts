import { describe, expect, it } from "bun:test";
import { createInMemoryAccountLockout } from "../../src/infrastructure/security/account-lockout.js";

describe("InMemory AccountLockout", () => {
  it("does not lock after fewer than max attempts", async () => {
    const lockout = createInMemoryAccountLockout({ maxAttempts: 3, lockoutDurationMs: 5000 });

    const r1 = await lockout.recordFailedAttempt("user@test.com");
    expect(r1.ok && r1.value).toBe(false);

    const r2 = await lockout.recordFailedAttempt("user@test.com");
    expect(r2.ok && r2.value).toBe(false);
  });

  it("locks after max attempts", async () => {
    const lockout = createInMemoryAccountLockout({ maxAttempts: 3, lockoutDurationMs: 5000 });

    await lockout.recordFailedAttempt("lock@test.com");
    await lockout.recordFailedAttempt("lock@test.com");
    const r3 = await lockout.recordFailedAttempt("lock@test.com");
    expect(r3.ok && r3.value).toBe(true);
  });

  it("isLocked returns lock expiry", async () => {
    const lockout = createInMemoryAccountLockout({ maxAttempts: 2, lockoutDurationMs: 10_000 });

    await lockout.recordFailedAttempt("check@test.com");
    await lockout.recordFailedAttempt("check@test.com");

    const result = await lockout.isLocked("check@test.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value).toBeGreaterThan(Date.now());
    }
  });

  it("reset clears lockout", async () => {
    const lockout = createInMemoryAccountLockout({ maxAttempts: 2, lockoutDurationMs: 10_000 });

    await lockout.recordFailedAttempt("reset@test.com");
    await lockout.recordFailedAttempt("reset@test.com");

    await lockout.resetAttempts("reset@test.com");

    const result = await lockout.isLocked("reset@test.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("not locked for unknown email", async () => {
    const lockout = createInMemoryAccountLockout({ maxAttempts: 3, lockoutDurationMs: 5000 });
    const result = await lockout.isLocked("unknown@test.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
