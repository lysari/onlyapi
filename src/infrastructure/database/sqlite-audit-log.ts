import type { Database } from "bun:sqlite";
import { type AppError, internal } from "../../core/errors/app-error.js";
import type { AuditEntry, AuditLog, AuditQueryOptions } from "../../core/ports/audit-log.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite audit log — append-only ledger backed by bun:sqlite.
 * Supports querying by userId, action, and time range.
 */

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  detail: string | null;
  ip: string;
  timestamp: number;
}

const rowToEntry = (row: AuditRow): AuditEntry => ({
  id: row.id,
  userId: row.user_id,
  action: row.action as AuditEntry["action"],
  resource: row.resource,
  resourceId: row.resource_id,
  detail: row.detail,
  ip: row.ip,
  timestamp: row.timestamp,
});

export const createSqliteAuditLog = (db: Database): AuditLog => {
  const insertStmt = db.prepare(
    "INSERT INTO audit_log (id, user_id, action, resource, resource_id, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  return {
    async append(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<Result<void, AppError>> {
      try {
        insertStmt.run(
          generateId(),
          entry.userId,
          entry.action,
          entry.resource,
          entry.resourceId,
          entry.detail,
          entry.ip,
          Date.now(),
        );
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to append audit entry", e));
      }
    },

    async query(options: AuditQueryOptions): Promise<Result<readonly AuditEntry[], AppError>> {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (options.userId !== undefined) {
          conditions.push("user_id = ?");
          params.push(options.userId);
        }
        if (options.action !== undefined) {
          conditions.push("action = ?");
          params.push(options.action);
        }
        if (options.since !== undefined) {
          conditions.push("timestamp >= ?");
          params.push(options.since);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = options.limit ?? 50;
        const sql = `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const rows = db
          .query(sql)
          .all(...(params as import("bun:sqlite").SQLQueryBindings[])) as AuditRow[];
        return ok(rows.map(rowToEntry));
      } catch (e: unknown) {
        return err(internal("Failed to query audit log", e));
      }
    },
  };
};
