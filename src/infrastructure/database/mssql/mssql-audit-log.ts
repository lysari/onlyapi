/**
 * SQL Server audit log adapter.
 */

import type sql from "mssql";
import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { AuditEntry, AuditLog, AuditQueryOptions } from "../../../core/ports/audit-log.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

export const createMssqlAuditLog = (pool: sql.ConnectionPool): AuditLog => ({
  async append(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<Result<void, AppError>> {
    try {
      const id = generateId();
      const timestamp = Date.now();
      await pool
        .request()
        .input("id", id)
        .input("userId", entry.userId)
        .input("action", entry.action)
        .input("resource", entry.resource)
        .input("resourceId", entry.resourceId)
        .input("detail", entry.detail)
        .input("ip", entry.ip)
        .input("timestamp", timestamp)
        .query(`
          INSERT INTO audit_log (id, user_id, action, resource, resource_id, detail, ip, timestamp)
          VALUES (@id, @userId, @action, @resource, @resourceId, @detail, @ip, @timestamp)
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async query(options: AuditQueryOptions): Promise<Result<readonly AuditEntry[], AppError>> {
    try {
      const conditions: string[] = [];
      const req = pool.request();
      let paramIdx = 0;

      if (options.userId !== undefined) {
        const p = `p${paramIdx++}`;
        conditions.push(`user_id = @${p}`);
        req.input(p, options.userId);
      }
      if (options.action !== undefined) {
        const p = `p${paramIdx++}`;
        conditions.push(`action = @${p}`);
        req.input(p, options.action);
      }
      if (options.since !== undefined) {
        const p = `p${paramIdx++}`;
        conditions.push(`timestamp >= @${p}`);
        req.input(p, options.since);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = options.limit ?? 50;
      const limitParam = `p${paramIdx}`;
      req.input(limitParam, limit);

      const query = `SELECT TOP (@${limitParam}) * FROM audit_log ${where} ORDER BY timestamp DESC`;
      const result = await req.query(query);

      return ok(
        result.recordset.map(
          (r: Record<string, unknown>) =>
            ({
              id: r["id"] as string,
              userId: (r["user_id"] as string) ?? null,
              action: r["action"],
              resource: r["resource"] as string,
              resourceId: (r["resource_id"] as string) ?? null,
              detail: (r["detail"] as string) ?? null,
              ip: r["ip"] as string,
              timestamp: Number(r["timestamp"]),
            }) as AuditEntry,
        ),
      );
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
