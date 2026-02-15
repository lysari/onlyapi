/**
 * PostgreSQL refresh token store adapter.
 */

import { conflict, internal, notFound } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type {
  RefreshTokenFamily,
  RefreshTokenStore,
} from "../../../core/ports/refresh-token-store.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

const toFamily = (row: Record<string, unknown>): RefreshTokenFamily => ({
  id: row["id"] as string,
  userId: brand<string, "UserId">(row["user_id"] as string),
  currentTokenHash: row["current_token_hash"] as string,
  revoked: row["revoked"] as boolean,
  createdAt: Number(row["created_at"]),
  updatedAt: Number(row["updated_at"]),
});

export const createPgRefreshTokenStore = (sql: PgClient): RefreshTokenStore => ({
  async createFamily(userId: UserId, tokenHash: string): Promise<Result<string, AppError>> {
    try {
      const id = generateId();
      const now = Date.now();
      await sql`
        INSERT INTO refresh_token_families (id, user_id, current_token_hash, revoked, created_at, updated_at)
        VALUES (${id}, ${userId as string}, ${tokenHash}, FALSE, ${now}, ${now})
      `;
      return ok(id);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async rotate(
    familyId: string,
    oldTokenHash: string,
    newTokenHash: string,
  ): Promise<Result<void, AppError>> {
    try {
      const rows = await sql`
        SELECT * FROM refresh_token_families WHERE id = ${familyId} AND revoked = FALSE
      `;
      if (rows.length === 0) return err(notFound("Refresh token family"));

      const family = rows[0];
      if (family.current_token_hash !== oldTokenHash) {
        // Reuse detected — revoke entire family
        await sql`UPDATE refresh_token_families SET revoked = TRUE, updated_at = ${Date.now()} WHERE id = ${familyId}`;
        return err(conflict("Token reuse detected"));
      }

      await sql`
        UPDATE refresh_token_families
        SET current_token_hash = ${newTokenHash}, updated_at = ${Date.now()}
        WHERE id = ${familyId}
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async findByTokenHash(tokenHash: string): Promise<Result<RefreshTokenFamily | null, AppError>> {
    try {
      const rows = await sql`
        SELECT * FROM refresh_token_families WHERE current_token_hash = ${tokenHash}
      `;
      if (rows.length === 0) return ok(null);
      return ok(toFamily(rows[0] as Record<string, unknown>));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async revokeFamily(familyId: string): Promise<Result<void, AppError>> {
    try {
      await sql`
        UPDATE refresh_token_families SET revoked = TRUE, updated_at = ${Date.now()} WHERE id = ${familyId}
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async revokeAllForUser(userId: UserId): Promise<Result<void, AppError>> {
    try {
      await sql`
        UPDATE refresh_token_families SET revoked = TRUE, updated_at = ${Date.now()} WHERE user_id = ${userId as string}
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(maxAgeMs: number): Promise<Result<number, AppError>> {
    try {
      const cutoff = Date.now() - maxAgeMs;
      const result = await sql`
        DELETE FROM refresh_token_families WHERE revoked = TRUE AND updated_at < ${cutoff}
      `;
      return ok(result.count ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
