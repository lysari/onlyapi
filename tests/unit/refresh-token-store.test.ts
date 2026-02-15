import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createSqliteRefreshTokenStore } from "../../src/infrastructure/database/sqlite-refresh-token-store.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");
let db: Database;
let store: ReturnType<typeof createSqliteRefreshTokenStore>;
const userId = brand<string, "UserId">("user-1") as UserId;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  await migrateUp(db, logger);
  store = createSqliteRefreshTokenStore(db);
});

describe("RefreshTokenStore", () => {
  it("creates a family and finds by token hash", async () => {
    const createResult = await store.createFamily(userId, "hash-1");
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const familyId = createResult.value;
    expect(familyId).toBeString();

    const findResult = await store.findByTokenHash("hash-1");
    expect(findResult.ok).toBe(true);
    if (!findResult.ok) return;
    expect(findResult.value).not.toBeNull();
    expect(findResult.value?.userId).toBe(userId);
    expect(findResult.value?.id).toBe(familyId);
    expect(findResult.value?.revoked).toBe(false);
  });

  it("returns null for unknown token hash", async () => {
    const result = await store.findByTokenHash("nonexistent");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("rotates a token", async () => {
    const createResult = await store.createFamily(userId, "hash-1");
    if (!createResult.ok) return;
    const familyId = createResult.value;

    const rotateResult = await store.rotate(familyId, "hash-1", "hash-2");
    expect(rotateResult.ok).toBe(true);

    // Old hash should not be found
    const findOld = await store.findByTokenHash("hash-1");
    expect(findOld.ok).toBe(true);
    if (!findOld.ok) return;
    expect(findOld.value).toBeNull();

    // New hash should be found
    const findNew = await store.findByTokenHash("hash-2");
    expect(findNew.ok).toBe(true);
    if (!findNew.ok) return;
    expect(findNew.value).not.toBeNull();
    expect(findNew.value?.id).toBe(familyId);
  });

  it("rejects rotation with wrong old hash (reuse detection)", async () => {
    const createResult = await store.createFamily(userId, "hash-1");
    if (!createResult.ok) return;
    const familyId = createResult.value;

    await store.rotate(familyId, "hash-1", "hash-2");

    // Try to reuse old hash
    const reuseResult = await store.rotate(familyId, "hash-1", "hash-3");
    expect(reuseResult.ok).toBe(false);
    if (reuseResult.ok) return;
    expect(reuseResult.error.code).toBe("UNAUTHORIZED");
  });

  it("revokes a family", async () => {
    const createResult = await store.createFamily(userId, "hash-1");
    if (!createResult.ok) return;

    await store.revokeFamily(createResult.value);

    const findResult = await store.findByTokenHash("hash-1");
    expect(findResult.ok).toBe(true);
    if (!findResult.ok) return;
    expect(findResult.value?.revoked).toBe(true);
  });

  it("revokes all families for a user", async () => {
    await store.createFamily(userId, "hash-1");
    await store.createFamily(userId, "hash-2");

    await store.revokeAllForUser(userId);

    const f1 = await store.findByTokenHash("hash-1");
    const f2 = await store.findByTokenHash("hash-2");
    expect(f1.ok && f1.value?.revoked).toBe(true);
    expect(f2.ok && f2.value?.revoked).toBe(true);
  });

  it("prunes old families", async () => {
    await store.createFamily(userId, "hash-old");

    // Wait a moment to ensure time difference
    await Bun.sleep(5);

    // Prune with 1ms max age (everything older than 1ms is pruned)
    const pruneResult = await store.prune(1);
    expect(pruneResult.ok).toBe(true);
    if (!pruneResult.ok) return;
    expect(pruneResult.value).toBeGreaterThanOrEqual(1);

    const findResult = await store.findByTokenHash("hash-old");
    expect(findResult.ok).toBe(true);
    if (!findResult.ok) return;
    expect(findResult.value).toBeNull();
  });
});
