import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { migrateDown, migrateUp } from "../../src/infrastructure/database/migrations/runner.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

const logger = createLogger("error");

describe("Migrations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("applies all migrations", async () => {
    const count = await migrateUp(db, logger);
    expect(count).toBe(4);

    // Verify tables exist
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("token_blacklist");
    expect(names).toContain("audit_log");
    expect(names).toContain("verification_tokens");
    expect(names).toContain("refresh_token_families");
    expect(names).toContain("api_keys");
    expect(names).toContain("password_history");
    expect(names).toContain("oauth_accounts");
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
    expect(version).toBe("004");

    // auth_platform tables should be gone
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string;
    }>;
    const names = tables.map((t) => t.name);
    expect(names).not.toContain("verification_tokens");
    expect(names).not.toContain("refresh_token_families");
    expect(names).toContain("users");
    expect(names).toContain("token_blacklist");
    expect(names).toContain("audit_log");
  });

  it("rolls back all migrations", async () => {
    await migrateUp(db, logger);
    await migrateDown(db, logger); // rolls back 004
    await migrateDown(db, logger); // rolls back 003
    await migrateDown(db, logger); // rolls back 002
    const version = await migrateDown(db, logger); // rolls back 001
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
    await migrateDown(db, logger);
    await migrateDown(db, logger);
    const version = await migrateDown(db, logger);
    expect(version).toBeNull();
  });
});
