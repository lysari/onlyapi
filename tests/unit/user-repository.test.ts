import { describe, expect, it } from "bun:test";
import { brand } from "../../src/core/types/brand.js";
import { createInMemoryUserRepository } from "../../src/infrastructure/database/in-memory-user.repository.js";

describe("InMemoryUserRepository", () => {
  const repo = createInMemoryUserRepository();

  it("creates and retrieves a user", async () => {
    const result = await repo.create({
      email: "test@example.com",
      passwordHash: "hash123",
      role: "user",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const found = await repo.findById(result.value.id);
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value.email).toBe("test@example.com");
    }
  });

  it("finds by email", async () => {
    const result = await repo.findByEmail("test@example.com");
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate email", async () => {
    const result = await repo.create({
      email: "test@example.com",
      passwordHash: "hash",
      role: "user",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("returns not found for missing user", async () => {
    const result = await repo.findById(brand<string, "UserId">("nonexistent"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("updates a user", async () => {
    const created = await repo.create({
      email: "update@example.com",
      passwordHash: "hash",
      role: "user",
    });
    if (!created.ok) return;

    const updated = await repo.update(created.value.id, { email: "new@example.com" });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.email).toBe("new@example.com");
  });

  it("deletes a user", async () => {
    const created = await repo.create({
      email: "delete@example.com",
      passwordHash: "hash",
      role: "user",
    });
    if (!created.ok) return;

    const deleted = await repo.delete(created.value.id);
    expect(deleted.ok).toBe(true);

    const found = await repo.findById(created.value.id);
    expect(found.ok).toBe(false);
  });
});
