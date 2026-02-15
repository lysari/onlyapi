import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { migrateUp, migrateDown } from "../../src/infrastructure/database/migrations/runner.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");

describe("Migrations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("applies all migrations", async () => {
    const count = await migrateUp(db, logger);
    expect(count).toBe(2);

    // Verify tables exist
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("token_blacklist");
    expect(names).toContain("_migrations");
  });

  it("is idempotent (running twice applies nothing the second time)", async () => {
    await migrateUp(db, logger);
    const count = await migrateUp(db, logger);
    expect(count).toBe(0);
  });

  it("rolls back the last migration", async () => {
    await migrateUp(db, logger);
    const version = await migrateDown(db, logger);
    expect(version).toBe("002");

    // token_blacklist should be gone
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).not.toContain("token_blacklist");
    expect(names).toContain("users");
  });

  it("rolls back all migrations", async () => {
    await migrateUp(db, logger);
    await migrateDown(db, logger);
    const version = await migrateDown(db, logger);
    expect(version).toBe("001");

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations'")
      .all() as Array<{ name: string }>;
    expect(tables.length).toBe(0);
  });

  it("returns null when nothing to rollback", async () => {
    await migrateUp(db, logger);
    await migrateDown(db, logger);
    await migrateDown(db, logger);
    const version = await migrateDown(db, logger);
    expect(version).toBeNull();
  });
});
