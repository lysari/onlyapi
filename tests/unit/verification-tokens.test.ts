import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createSqliteVerificationTokenRepo } from "../../src/infrastructure/database/sqlite-verification-tokens.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");
let db: Database;
let repo: ReturnType<typeof createSqliteVerificationTokenRepo>;
const userId = brand<string, "UserId">("user-1") as UserId;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF"); // simplify test isolation
  await migrateUp(db, logger);
  repo = createSqliteVerificationTokenRepo(db);
});

describe("VerificationTokenRepository", () => {
  it("creates and verifies a token", async () => {
    const createResult = await repo.create(userId, "email_verification", 60_000);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const rawToken = createResult.value;
    expect(rawToken).toBeString();
    expect(rawToken.length).toBe(64); // 32 bytes hex

    const verifyResult = await repo.verify(rawToken, "email_verification");
    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;
    expect(verifyResult.value).toBe(userId);
  });

  it("rejects invalid token", async () => {
    const result = await repo.verify("nonexistent-token", "email_verification");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects already-used token", async () => {
    const createResult = await repo.create(userId, "email_verification", 60_000);
    if (!createResult.ok) return;

    // Use the token once
    await repo.verify(createResult.value, "email_verification");

    // Try to use it again
    const secondVerify = await repo.verify(createResult.value, "email_verification");
    expect(secondVerify.ok).toBe(false);
    if (secondVerify.ok) return;
    expect(secondVerify.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects expired token", async () => {
    // Create with 1ms TTL
    const createResult = await repo.create(userId, "password_reset", 1);
    if (!createResult.ok) return;

    // Wait a tiny bit
    await Bun.sleep(5);

    const verifyResult = await repo.verify(createResult.value, "password_reset");
    expect(verifyResult.ok).toBe(false);
    if (verifyResult.ok) return;
    expect(verifyResult.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects token with wrong type", async () => {
    const createResult = await repo.create(userId, "email_verification", 60_000);
    if (!createResult.ok) return;

    const verifyResult = await repo.verify(createResult.value, "password_reset");
    expect(verifyResult.ok).toBe(false);
  });

  it("invalidateAll removes all tokens for a user/type", async () => {
    const r1 = await repo.create(userId, "email_verification", 60_000);
    const r2 = await repo.create(userId, "email_verification", 60_000);
    if (!r1.ok || !r2.ok) return;

    await repo.invalidateAll(userId, "email_verification");

    expect((await repo.verify(r1.value, "email_verification")).ok).toBe(false);
    expect((await repo.verify(r2.value, "email_verification")).ok).toBe(false);
  });

  it("prune removes expired and used tokens", async () => {
    // Create and use a token
    const r1 = await repo.create(userId, "email_verification", 60_000);
    if (!r1.ok) return;
    await repo.verify(r1.value, "email_verification"); // marks as used

    // Create an expired token
    await repo.create(userId, "password_reset", 1);
    await Bun.sleep(5);

    const pruneResult = await repo.prune();
    expect(pruneResult.ok).toBe(true);
    if (!pruneResult.ok) return;
    expect(pruneResult.value).toBeGreaterThanOrEqual(1);
  });
});
