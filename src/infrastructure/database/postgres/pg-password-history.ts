/**
 * PostgreSQL password history adapter.
 */

import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { PasswordHistory } from "../../../core/ports/password-history.js";
import type { UserId } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

export const createPgPasswordHistory = (sql: PgClient): PasswordHistory => ({
  async add(userId: UserId, passwordHash: string): Promise<Result<void, AppError>> {
    try {
      const id = generateId();
      await sql`
        INSERT INTO password_history (id, user_id, password_hash, created_at)
        VALUES (${id}, ${userId as string}, ${passwordHash}, ${Date.now()})
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async getRecent(userId: UserId, count: number): Promise<Result<readonly string[], AppError>> {
    try {
      const rows = await sql`
        SELECT password_hash FROM password_history
        WHERE user_id = ${userId as string}
        ORDER BY created_at DESC
        LIMIT ${count}
      `;
      return ok(rows.map((r: { password_hash: string }) => r.password_hash));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(userId: UserId, keepCount: number): Promise<Result<void, AppError>> {
    try {
      // Delete all but the most recent `keepCount` entries
      await sql`
        DELETE FROM password_history
        WHERE user_id = ${userId as string}
        AND id NOT IN (
          SELECT id FROM password_history
          WHERE user_id = ${userId as string}
          ORDER BY created_at DESC
          LIMIT ${keepCount}
        )
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
