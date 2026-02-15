/**
 * PostgreSQL token blacklist adapter.
 */

import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { TokenBlacklist } from "../../../core/ports/token-blacklist.js";
import { type Result, err, ok } from "../../../core/types/result.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

export const createPgTokenBlacklist = (sql: PgClient): TokenBlacklist => ({
  async add(tokenHash: string, expiresAt: number): Promise<Result<void, AppError>> {
    try {
      await sql`
        INSERT INTO token_blacklist (token_hash, expires_at, created_at)
        VALUES (${tokenHash}, ${expiresAt}, ${Date.now()})
        ON CONFLICT (token_hash) DO NOTHING
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async isBlacklisted(tokenHash: string): Promise<Result<boolean, AppError>> {
    try {
      const rows = await sql`
        SELECT 1 FROM token_blacklist WHERE token_hash = ${tokenHash} AND expires_at > ${Date.now()}
      `;
      return ok(rows.length > 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(): Promise<Result<number, AppError>> {
    try {
      const result = await sql`
        DELETE FROM token_blacklist WHERE expires_at <= ${Date.now()}
      `;
      return ok(result.count ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
