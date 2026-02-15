import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { AuditAction } from "../../src/core/ports/audit-log.js";
import { createSqliteAuditLog } from "../../src/infrastructure/database/sqlite-audit-log.js";

describe("SqliteAuditLog", () => {
  let db: InstanceType<typeof Database>;
  let auditLog: ReturnType<typeof createSqliteAuditLog>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      detail TEXT,
      ip TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp)");
    auditLog = createSqliteAuditLog(db);
  });

  it("appends an audit entry", async () => {
    const result = await auditLog.append({
      userId: "user-123",
      action: AuditAction.USER_LOGGED_IN,
      resource: "session",
      resourceId: null,
      detail: null,
      ip: "127.0.0.1",
    });
    expect(result.ok).toBe(true);

    // Verify it was stored
    const rows = db.query("SELECT * FROM audit_log").all() as { action: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe("USER_LOGGED_IN");
  });

  it("queries all entries", async () => {
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_REGISTERED,
      resource: "user",
      resourceId: "u1",
      detail: null,
      ip: "10.0.0.1",
    });
    await auditLog.append({
      userId: "u2",
      action: AuditAction.USER_LOGGED_IN,
      resource: "session",
      resourceId: null,
      detail: null,
      ip: "10.0.0.2",
    });

    const result = await auditLog.query({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);
  });

  it("queries by userId", async () => {
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_REGISTERED,
      resource: "user",
      resourceId: "u1",
      detail: null,
      ip: "10.0.0.1",
    });
    await auditLog.append({
      userId: "u2",
      action: AuditAction.USER_LOGGED_IN,
      resource: "session",
      resourceId: null,
      detail: null,
      ip: "10.0.0.2",
    });

    const result = await auditLog.query({ userId: "u1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]?.userId).toBe("u1");
  });

  it("queries by action", async () => {
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_REGISTERED,
      resource: "user",
      resourceId: "u1",
      detail: null,
      ip: "10.0.0.1",
    });
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_LOGGED_IN,
      resource: "session",
      resourceId: null,
      detail: null,
      ip: "10.0.0.1",
    });

    const result = await auditLog.query({ action: AuditAction.USER_REGISTERED });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]?.action).toBe("USER_REGISTERED");
  });

  it("queries with limit", async () => {
    for (let i = 0; i < 5; i++) {
      await auditLog.append({
        userId: `u${i}`,
        action: AuditAction.USER_REGISTERED,
        resource: "user",
        resourceId: `u${i}`,
        detail: null,
        ip: "10.0.0.1",
      });
    }

    const result = await auditLog.query({ limit: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(3);
  });

  it("queries with since filter", async () => {
    const now = Date.now();
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_REGISTERED,
      resource: "user",
      resourceId: "u1",
      detail: null,
      ip: "10.0.0.1",
    });

    // Query with a timestamp far in the future — should return nothing
    const result = await auditLog.query({ since: now + 60_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);

    // Query with a timestamp in the past — should return the entry
    const result2 = await auditLog.query({ since: now - 60_000 });
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.value.length).toBe(1);
  });

  it("returns entries in descending timestamp order", async () => {
    for (let i = 0; i < 3; i++) {
      await auditLog.append({
        userId: `u${i}`,
        action: AuditAction.USER_REGISTERED,
        resource: "user",
        resourceId: `u${i}`,
        detail: `entry-${i}`,
        ip: "10.0.0.1",
      });
      // Small delay to ensure distinct timestamps
      await Bun.sleep(2);
    }

    const result = await auditLog.query({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(3);
    // Most recent first
    for (let i = 1; i < result.value.length; i++) {
      const prev = result.value[i - 1];
      const curr = result.value[i];
      if (prev && curr) {
        expect(prev.timestamp).toBeGreaterThanOrEqual(curr.timestamp);
      }
    }
  });

  it("preserves detail field", async () => {
    await auditLog.append({
      userId: "u1",
      action: AuditAction.USER_ROLE_CHANGED,
      resource: "user",
      resourceId: "u1",
      detail: "Role changed from user to admin",
      ip: "192.168.1.1",
    });

    const result = await auditLog.query({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.detail).toBe("Role changed from user to admin");
  });
});
