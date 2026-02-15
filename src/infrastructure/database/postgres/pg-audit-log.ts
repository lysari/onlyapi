/**
 * PostgreSQL audit log adapter.
 */

import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { AuditEntry, AuditLog, AuditQueryOptions } from "../../../core/ports/audit-log.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

export const createPgAuditLog = (sql: PgClient): AuditLog => ({
  async append(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<Result<void, AppError>> {
    try {
      const id = generateId();
      const timestamp = Date.now();
      await sql`
        INSERT INTO audit_log (id, user_id, action, resource, resource_id, detail, ip, timestamp)
        VALUES (${id}, ${entry.userId}, ${entry.action}, ${entry.resource}, ${entry.resourceId}, ${entry.detail}, ${entry.ip}, ${timestamp})
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async query(options: AuditQueryOptions): Promise<Result<readonly AuditEntry[], AppError>> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (options.userId !== undefined) {
        conditions.push(`user_id = $${idx++}`);
        params.push(options.userId);
      }
      if (options.action !== undefined) {
        conditions.push(`action = $${idx++}`);
        params.push(options.action);
      }
      if (options.since !== undefined) {
        conditions.push(`timestamp >= $${idx++}`);
        params.push(options.since);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = options.limit ?? 50;
      params.push(limit);

      const query = `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT $${idx}`;
      const rows = await sql.unsafe(query, params);

      return ok(
        rows.map(
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
