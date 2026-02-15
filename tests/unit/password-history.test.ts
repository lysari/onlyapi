import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createSqlitePasswordHistory } from "../../src/infrastructure/database/sqlite-password-history.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");
let db: Database;
let history: ReturnType<typeof createSqlitePasswordHistory>;
const userId = brand<string, "UserId">("user-1") as UserId;

beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  await migrateUp(db, logger);
  history = createSqlitePasswordHistory(db);
});

describe("PasswordHistory", () => {
  it("adds and retrieves recent hashes", async () => {
    await history.add(userId, "hash-1");
    await Bun.sleep(2);
    await history.add(userId, "hash-2");
    await Bun.sleep(2);
    await history.add(userId, "hash-3");

    const result = await history.getRecent(userId, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(3);
    expect(result.value[0]).toBe("hash-3"); // most recent first
    expect(result.value[1]).toBe("hash-2");
    expect(result.value[2]).toBe("hash-1");
  });

  it("limits to requested count", async () => {
    await history.add(userId, "hash-1");
    await history.add(userId, "hash-2");
    await history.add(userId, "hash-3");

    const result = await history.getRecent(userId, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);
  });

  it("returns empty for user with no history", async () => {
    const user2 = brand<string, "UserId">("user-2") as UserId;
    const result = await history.getRecent(user2, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it("isolates history by user", async () => {
    const user2 = brand<string, "UserId">("user-2") as UserId;
    await history.add(userId, "hash-u1");
    await history.add(user2, "hash-u2");

    const r1 = await history.getRecent(userId, 10);
    const r2 = await history.getRecent(user2, 10);
    expect(r1.ok && r1.value.length).toBe(1);
    expect(r2.ok && r2.value.length).toBe(1);
    if (r1.ok) expect(r1.value[0]).toBe("hash-u1");
    if (r2.ok) expect(r2.value[0]).toBe("hash-u2");
  });

  it("prunes old entries keeping only N most recent", async () => {
    await history.add(userId, "hash-1");
    await Bun.sleep(2);
    await history.add(userId, "hash-2");
    await Bun.sleep(2);
    await history.add(userId, "hash-3");
    await Bun.sleep(2);
    await history.add(userId, "hash-4");
    await Bun.sleep(2);
    await history.add(userId, "hash-5");

    await history.prune(userId, 3);

    const result = await history.getRecent(userId, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(3);
    expect(result.value).toEqual(["hash-5", "hash-4", "hash-3"]);
  });
});
