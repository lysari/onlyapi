/**
 * SQL Server verification token repository adapter.
 */

import type sql from "mssql";
import { internal, notFound } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type {
  VerificationTokenRepository,
  VerificationTokenType,
} from "../../../core/ports/verification-token.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

export const createMssqlVerificationTokenRepo = (
  pool: sql.ConnectionPool,
): VerificationTokenRepository => ({
  async create(
    userId: UserId,
    type: VerificationTokenType,
    ttlMs: number,
  ): Promise<Result<string, AppError>> {
    try {
      const id = generateId();
      const rawToken = generateId();
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
      const tokenHash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const now = Date.now();
      const expiresAt = now + ttlMs;

      await pool
        .request()
        .input("id", id)
        .input("userId", userId as string)
        .input("type", type)
        .input("tokenHash", tokenHash)
        .input("expiresAt", expiresAt)
        .input("createdAt", now)
        .query(`
          INSERT INTO verification_tokens (id, user_id, type, token_hash, expires_at, created_at)
          VALUES (@id, @userId, @type, @tokenHash, @expiresAt, @createdAt)
        `);

      return ok(rawToken);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async verify(rawToken: string, type: VerificationTokenType): Promise<Result<UserId, AppError>> {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
      const tokenHash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const result = await pool
        .request()
        .input("tokenHash", tokenHash)
        .input("type", type)
        .input("now", Date.now())
        .query(`
          SELECT * FROM verification_tokens
          WHERE token_hash = @tokenHash AND type = @type AND used_at IS NULL AND expires_at > @now
        `);

      if (result.recordset.length === 0) return err(notFound("Verification token"));

      const row = result.recordset[0];
      await pool
        .request()
        .input("usedAt", Date.now())
        .input("id", row.id)
        .query("UPDATE verification_tokens SET used_at = @usedAt WHERE id = @id");

      return ok(brand<string, "UserId">(row.user_id as string));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async invalidateAll(
    userId: UserId,
    type: VerificationTokenType,
  ): Promise<Result<void, AppError>> {
    try {
      await pool
        .request()
        .input("usedAt", Date.now())
        .input("userId", userId as string)
        .input("type", type)
        .query(`
          UPDATE verification_tokens SET used_at = @usedAt
          WHERE user_id = @userId AND type = @type AND used_at IS NULL
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(): Promise<Result<number, AppError>> {
    try {
      const result = await pool
        .request()
        .input("now", Date.now())
        .query("DELETE FROM verification_tokens WHERE expires_at <= @now OR used_at IS NOT NULL");
      return ok(result.rowsAffected[0] ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
