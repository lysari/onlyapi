/**
 * SQL Server password history adapter.
 */

import type sql from "mssql";
import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { PasswordHistory } from "../../../core/ports/password-history.js";
import type { UserId } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

export const createMssqlPasswordHistory = (pool: sql.ConnectionPool): PasswordHistory => ({
  async add(userId: UserId, passwordHash: string): Promise<Result<void, AppError>> {
    try {
      const id = generateId();
      await pool
        .request()
        .input("id", id)
        .input("userId", userId as string)
        .input("passwordHash", passwordHash)
        .input("createdAt", Date.now())
        .query(`
          INSERT INTO password_history (id, user_id, password_hash, created_at)
          VALUES (@id, @userId, @passwordHash, @createdAt)
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async getRecent(userId: UserId, count: number): Promise<Result<readonly string[], AppError>> {
    try {
      const result = await pool
        .request()
        .input("userId", userId as string)
        .input("count", count)
        .query(`
          SELECT TOP (@count) password_hash FROM password_history
          WHERE user_id = @userId
          ORDER BY created_at DESC
        `);
      return ok(result.recordset.map((r: { password_hash: string }) => r.password_hash));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(userId: UserId, keepCount: number): Promise<Result<void, AppError>> {
    try {
      // Delete all but the most recent `keepCount` entries
      await pool
        .request()
        .input("userId", userId as string)
        .input("keepCount", keepCount)
        .query(`
          DELETE FROM password_history
          WHERE user_id = @userId
          AND id NOT IN (
            SELECT TOP (@keepCount) id FROM password_history
            WHERE user_id = @userId
            ORDER BY created_at DESC
          )
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
