import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createSqliteApiKeyRepository } from "../../src/infrastructure/database/sqlite-api-keys.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");
let db: Database;
let repo: ReturnType<typeof createSqliteApiKeyRepository>;
const userId = brand<string, "UserId">("user-1") as UserId;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  await migrateUp(db, logger);
  repo = createSqliteApiKeyRepository(db);
});

describe("ApiKeyRepository", () => {
  it("creates a key and returns raw key with oapi_ prefix", async () => {
    const result = await repo.create(userId, "test-key", ["read", "write"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rawKey).toStartWith("oapi_");
    expect(result.value.rawKey.length).toBe(69); // "oapi_" + 64 hex chars
    expect(result.value.key.name).toBe("test-key");
    expect(result.value.key.userId).toBe(userId);
    expect(result.value.key.scopes).toEqual(["read", "write"]);
    expect(result.value.key.keyPrefix).toStartWith("oapi_");
    expect(result.value.key.keyPrefix).toEndWith("...");
    expect(result.value.key.expiresAt).toBeNull();
    expect(result.value.key.lastUsedAt).toBeNull();
  });

  it("verifies a key by raw key", async () => {
    const createResult = await repo.create(userId, "verify-key", []);
    if (!createResult.ok) return;

    const verifyResult = await repo.verify(createResult.value.rawKey);
    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;
    expect(verifyResult.value.id).toBe(createResult.value.key.id);
    expect(verifyResult.value.name).toBe("verify-key");
  });

  it("rejects invalid key", async () => {
    const result = await repo.verify("oapi_invalidkey");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects expired key", async () => {
    const pastExpiry = Date.now() - 1000;
    const createResult = await repo.create(userId, "expired-key", [], pastExpiry);
    if (!createResult.ok) return;

    const verifyResult = await repo.verify(createResult.value.rawKey);
    expect(verifyResult.ok).toBe(false);
    if (verifyResult.ok) return;
    expect(verifyResult.error.code).toBe("UNAUTHORIZED");
  });

  it("lists keys by user", async () => {
    await repo.create(userId, "key-1", ["read"]);
    await repo.create(userId, "key-2", ["write"]);

    const user2 = brand<string, "UserId">("user-2") as UserId;
    await repo.create(user2, "key-3", []);

    const listResult = await repo.listByUser(userId);
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    expect(listResult.value.length).toBe(2);
    // Should NOT contain the raw key hash — only prefix
    for (const key of listResult.value) {
      expect(key.keyPrefix).toEndWith("...");
    }
  });

  it("revokes a key", async () => {
    const createResult = await repo.create(userId, "revoke-key", []);
    if (!createResult.ok) return;

    const revokeResult = await repo.revoke(createResult.value.key.id, userId);
    expect(revokeResult.ok).toBe(true);

    const verifyResult = await repo.verify(createResult.value.rawKey);
    expect(verifyResult.ok).toBe(false);
  });

  it("revoke returns NOT_FOUND for wrong user", async () => {
    const createResult = await repo.create(userId, "other-key", []);
    if (!createResult.ok) return;

    const user2 = brand<string, "UserId">("user-2") as UserId;
    const result = await repo.revoke(createResult.value.key.id, user2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("touches a key to update lastUsedAt", async () => {
    const createResult = await repo.create(userId, "touch-key", []);
    if (!createResult.ok) return;

    expect(createResult.value.key.lastUsedAt).toBeNull();

    await repo.touch(createResult.value.key.id);

    const verifyResult = await repo.verify(createResult.value.rawKey);
    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;
    expect(verifyResult.value.lastUsedAt).not.toBeNull();
  });

  it("creates key with expiry", async () => {
    const futureExpiry = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const result = await repo.create(userId, "expiring-key", ["admin"], futureExpiry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.key.expiresAt).toBe(futureExpiry);

    // Should still be valid
    const verify = await repo.verify(result.value.rawKey);
    expect(verify.ok).toBe(true);
  });
});
