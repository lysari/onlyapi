import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSqliteUserRepository } from "../../src/infrastructure/database/sqlite-user.repository.js";
import { brand } from "../../src/core/types/brand.js";

let db: Database;
let repo: ReturnType<typeof createSqliteUserRepository>;

beforeEach(() => {
  db = new Database(":memory:");
  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.run("CREATE UNIQUE INDEX idx_users_email ON users(email)");
  repo = createSqliteUserRepository(db);
});

describe("SQLite UserRepository", () => {
  it("creates a user and finds by id", async () => {
    const result = await repo.create({
      email: "test@example.com",
      passwordHash: "hash123",
      role: "user",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const found = await repo.findById(result.value.id);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.email).toBe("test@example.com");
  });

  it("finds by email", async () => {
    await repo.create({
      email: "find@example.com",
      passwordHash: "hash",
      role: "user",
    });

    const result = await repo.findByEmail("find@example.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("find@example.com");
  });

  it("returns NOT_FOUND for missing user", async () => {
    const result = await repo.findById(brand<string, "UserId">("nonexistent"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("rejects duplicate email", async () => {
    await repo.create({ email: "dup@example.com", passwordHash: "h1", role: "user" });
    const result = await repo.create({ email: "dup@example.com", passwordHash: "h2", role: "user" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("updates a user", async () => {
    const created = await repo.create({ email: "upd@example.com", passwordHash: "h", role: "user" });
    if (!created.ok) return;

    const updated = await repo.update(created.value.id, { email: "new@example.com" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.email).toBe("new@example.com");
  });

  it("deletes a user", async () => {
    const created = await repo.create({ email: "del@example.com", passwordHash: "h", role: "user" });
    if (!created.ok) return;

    const deleted = await repo.delete(created.value.id);
    expect(deleted.ok).toBe(true);

    const found = await repo.findById(created.value.id);
    expect(found.ok).toBe(false);
  });

  it("delete returns NOT_FOUND for missing user", async () => {
    const result = await repo.delete(brand<string, "UserId">("ghost"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
