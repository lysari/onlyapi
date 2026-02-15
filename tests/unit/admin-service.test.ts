import { describe, it, expect, beforeEach } from "bun:test";
import { createInMemoryUserRepository } from "../../src/infrastructure/database/in-memory-user.repository.js";
import { brand } from "../../src/core/types/brand.js";
import { createAdminService } from "../../src/application/services/admin.service.js";
import type { AuditLog, AuditEntry, AuditQueryOptions } from "../../src/core/ports/audit-log.js";
import type { Logger } from "../../src/core/ports/logger.js";
import { ok } from "../../src/core/types/result.js";
import type { UserId } from "../../src/core/types/brand.js";

// Minimal no-op logger
const noop = () => {};
const noopLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => noopLogger,
};

// In-memory audit log for testing
const createTestAuditLog = (): AuditLog & { entries: AuditEntry[] } => {
  const entries: AuditEntry[] = [];
  return {
    entries,
    async append(entry) {
      entries.push({
        ...entry,
        id: `audit-${entries.length}`,
        timestamp: Date.now(),
      });
      return ok(undefined);
    },
    async query(_options: AuditQueryOptions) {
      return ok(entries);
    },
  };
};

describe("AdminService", () => {
  let userRepo: ReturnType<typeof createInMemoryUserRepository>;
  let auditLog: ReturnType<typeof createTestAuditLog>;
  let adminService: ReturnType<typeof createAdminService>;

  beforeEach(async () => {
    userRepo = createInMemoryUserRepository();
    auditLog = createTestAuditLog();
    adminService = createAdminService({ userRepo, auditLog, logger: noopLogger });

    // Seed users with distinct timestamps for cursor pagination
    await userRepo.create({ email: "admin@test.com", passwordHash: "hash", role: "admin" });
    await Bun.sleep(5);
    await userRepo.create({ email: "user1@test.com", passwordHash: "hash", role: "user" });
    await Bun.sleep(5);
    await userRepo.create({ email: "user2@test.com", passwordHash: "hash", role: "user" });
  });

  it("listUsers returns paginated results", async () => {
    const result = await adminService.listUsers({ limit: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.length).toBe(3);
    expect(result.value.hasMore).toBe(false);
  });

  it("listUsers respects limit", async () => {
    const result = await adminService.listUsers({ limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.length).toBe(2);
    expect(result.value.hasMore).toBe(true);
    expect(result.value.nextCursor).not.toBeNull();
  });

  it("listUsers supports cursor pagination", async () => {
    const page1 = await adminService.listUsers({ limit: 2 });
    if (!page1.ok) return;
    expect(page1.value.items.length).toBe(2);

    const page2 = await adminService.listUsers({
      limit: 2,
      cursor: page1.value.nextCursor ?? undefined,
    });
    if (!page2.ok) return;
    expect(page2.value.items.length).toBe(1);
    expect(page2.value.hasMore).toBe(false);
  });

  it("listUsers filters by role", async () => {
    const result = await adminService.listUsers({ limit: 10, role: "admin" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.length).toBe(1);
    expect(result.value.items[0]?.email).toBe("admin@test.com");
  });

  it("listUsers filters by search", async () => {
    const result = await adminService.listUsers({ limit: 10, search: "user1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.length).toBe(1);
    expect(result.value.items[0]?.email).toBe("user1@test.com");
  });

  it("listUsers returns views without passwordHash", async () => {
    const result = await adminService.listUsers({ limit: 10 });
    if (!result.ok) return;
    const item = result.value.items[0];
    expect(item).toBeDefined();
    expect("passwordHash" in (item ?? {})).toBe(false);
    expect(item?.id).toBeDefined();
    expect(item?.email).toBeDefined();
    expect(item?.role).toBeDefined();
  });

  it("getUser returns a user by id", async () => {
    const listResult = await adminService.listUsers({ limit: 1 });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.getUser(userId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(userId);
    }
  });

  it("getUser returns error for nonexistent user", async () => {
    const result = await adminService.getUser(brand<string, "UserId">("nonexistent"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("changeRole updates the user role", async () => {
    const listResult = await adminService.listUsers({ limit: 10, role: "user" });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.changeRole(userId, { role: "admin" }, "other-admin", "127.0.0.1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe("admin");
    }
  });

  it("changeRole writes an audit log entry", async () => {
    const listResult = await adminService.listUsers({ limit: 10, role: "user" });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    await adminService.changeRole(userId, { role: "admin" }, "actor-id", "10.0.0.1");
    expect(auditLog.entries.length).toBeGreaterThan(0);
    const entry = auditLog.entries[auditLog.entries.length - 1];
    expect(entry?.action).toBe("USER_ROLE_CHANGED");
    expect(entry?.resourceId).toBe(userId);
  });

  it("changeRole prevents self-demotion", async () => {
    const listResult = await adminService.listUsers({ limit: 10 });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.changeRole(userId, { role: "user" }, userId, "127.0.0.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("banUser writes an audit entry", async () => {
    const listResult = await adminService.listUsers({ limit: 10, role: "user" });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.banUser(userId, { reason: "spam" }, "admin-actor", "127.0.0.1");
    expect(result.ok).toBe(true);
    const banEntry = auditLog.entries.find((e) => e.action === "USER_BANNED");
    expect(banEntry).toBeDefined();
    expect(banEntry?.detail).toBe("spam");
  });

  it("banUser prevents self-ban", async () => {
    const listResult = await adminService.listUsers({ limit: 1 });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.banUser(userId, {}, userId, "127.0.0.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("unbanUser writes an audit entry", async () => {
    const listResult = await adminService.listUsers({ limit: 10, role: "user" });
    if (!listResult.ok) return;
    const userId = listResult.value.items[0]?.id as UserId;

    const result = await adminService.unbanUser(userId, "admin-actor", "127.0.0.1");
    expect(result.ok).toBe(true);
    const unbanEntry = auditLog.entries.find((e) => e.action === "USER_UNBANNED");
    expect(unbanEntry).toBeDefined();
    expect(unbanEntry?.resourceId).toBe(userId);
  });
});
