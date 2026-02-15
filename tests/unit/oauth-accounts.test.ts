import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createSqliteOAuthAccountRepo } from "../../src/infrastructure/database/sqlite-oauth-accounts.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");
let db: Database;
let repo: ReturnType<typeof createSqliteOAuthAccountRepo>;
const userId = brand<string, "UserId">("user-1") as UserId;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  await migrateUp(db, logger);
  repo = createSqliteOAuthAccountRepo(db);
});

describe("OAuthAccountRepository", () => {
  it("links an OAuth account", async () => {
    const result = await repo.link(userId, "google", "g-123", "user@gmail.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe(userId);
    expect(result.value.provider).toBe("google");
    expect(result.value.providerUserId).toBe("g-123");
    expect(result.value.email).toBe("user@gmail.com");
  });

  it("finds by provider and provider user id", async () => {
    await repo.link(userId, "github", "gh-456", "user@github.com");

    const result = await repo.findByProvider("github", "gh-456");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBeNull();
    expect(result.value?.userId).toBe(userId);
  });

  it("returns null for unknown provider account", async () => {
    const result = await repo.findByProvider("google", "nonexistent");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("rejects duplicate provider linkage", async () => {
    await repo.link(userId, "google", "g-123", "user@gmail.com");
    const user2 = brand<string, "UserId">("user-2") as UserId;
    const result = await repo.link(user2, "google", "g-123", "other@gmail.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("lists accounts by user", async () => {
    await repo.link(userId, "google", "g-123", "user@gmail.com");
    await repo.link(userId, "github", "gh-456", "user@github.com");

    const result = await repo.listByUser(userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);
  });

  it("unlinks an account", async () => {
    const linkResult = await repo.link(userId, "google", "g-123", "user@gmail.com");
    if (!linkResult.ok) return;

    const unlinkResult = await repo.unlink(linkResult.value.id, userId);
    expect(unlinkResult.ok).toBe(true);

    const findResult = await repo.findByProvider("google", "g-123");
    expect(findResult.ok).toBe(true);
    if (!findResult.ok) return;
    expect(findResult.value).toBeNull();
  });

  it("unlink returns NOT_FOUND for wrong user", async () => {
    const linkResult = await repo.link(userId, "google", "g-123", "user@gmail.com");
    if (!linkResult.ok) return;

    const user2 = brand<string, "UserId">("user-2") as UserId;
    const result = await repo.unlink(linkResult.value.id, user2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
