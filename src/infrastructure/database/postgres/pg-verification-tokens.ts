/**
 * PostgreSQL verification token repository adapter.
 */

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

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

export const createPgVerificationTokenRepo = (sql: PgClient): VerificationTokenRepository => ({
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

      await sql`
        INSERT INTO verification_tokens (id, user_id, type, token_hash, expires_at, created_at)
        VALUES (${id}, ${userId as string}, ${type}, ${tokenHash}, ${expiresAt}, ${now})
      `;

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

      const rows = await sql`
        SELECT * FROM verification_tokens
        WHERE token_hash = ${tokenHash} AND type = ${type} AND used_at IS NULL AND expires_at > ${Date.now()}
      `;

      if (rows.length === 0) return err(notFound("Verification token"));

      const row = rows[0];
      await sql`UPDATE verification_tokens SET used_at = ${Date.now()} WHERE id = ${row.id}`;

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
      await sql`
        UPDATE verification_tokens SET used_at = ${Date.now()}
        WHERE user_id = ${userId as string} AND type = ${type} AND used_at IS NULL
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(): Promise<Result<number, AppError>> {
    try {
      const result = await sql`
        DELETE FROM verification_tokens WHERE expires_at <= ${Date.now()} OR used_at IS NOT NULL
      `;
      return ok(result.count ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
