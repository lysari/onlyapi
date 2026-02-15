/**
 * SQL Server token blacklist adapter.
 */

import type sql from "mssql";
import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { TokenBlacklist } from "../../../core/ports/token-blacklist.js";
import { type Result, err, ok } from "../../../core/types/result.js";

export const createMssqlTokenBlacklist = (pool: sql.ConnectionPool): TokenBlacklist => ({
  async add(tokenHash: string, expiresAt: number): Promise<Result<void, AppError>> {
    try {
      await pool
        .request()
        .input("tokenHash", tokenHash)
        .input("expiresAt", expiresAt)
        .input("createdAt", Date.now())
        .query(`
          IF NOT EXISTS (SELECT 1 FROM token_blacklist WHERE token_hash = @tokenHash)
            INSERT INTO token_blacklist (token_hash, expires_at, created_at)
            VALUES (@tokenHash, @expiresAt, @createdAt)
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async isBlacklisted(tokenHash: string): Promise<Result<boolean, AppError>> {
    try {
      const result = await pool
        .request()
        .input("tokenHash", tokenHash)
        .input("now", Date.now())
        .query("SELECT 1 FROM token_blacklist WHERE token_hash = @tokenHash AND expires_at > @now");
      return ok(result.recordset.length > 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(): Promise<Result<number, AppError>> {
    try {
      const result = await pool
        .request()
        .input("now", Date.now())
        .query("DELETE FROM token_blacklist WHERE expires_at <= @now");
      return ok(result.rowsAffected[0] ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
