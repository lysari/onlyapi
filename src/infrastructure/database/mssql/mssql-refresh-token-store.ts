/**
 * SQL Server refresh token store adapter.
 */

import type sql from "mssql";
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

const toFamily = (row: Record<string, unknown>): RefreshTokenFamily => ({
  id: row["id"] as string,
  userId: brand<string, "UserId">(row["user_id"] as string),
  currentTokenHash: row["current_token_hash"] as string,
  revoked: Boolean(row["revoked"]),
  createdAt: Number(row["created_at"]),
  updatedAt: Number(row["updated_at"]),
});

export const createMssqlRefreshTokenStore = (pool: sql.ConnectionPool): RefreshTokenStore => ({
  async createFamily(userId: UserId, tokenHash: string): Promise<Result<string, AppError>> {
    try {
      const id = generateId();
      const now = Date.now();
      await pool
        .request()
        .input("id", id)
        .input("userId", userId as string)
        .input("tokenHash", tokenHash)
        .input("now", now)
        .query(`
          INSERT INTO refresh_token_families (id, user_id, current_token_hash, revoked, created_at, updated_at)
          VALUES (@id, @userId, @tokenHash, 0, @now, @now)
        `);
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
      const result = await pool
        .request()
        .input("familyId", familyId)
        .query("SELECT * FROM refresh_token_families WHERE id = @familyId AND revoked = 0");

      if (result.recordset.length === 0) return err(notFound("Refresh token family"));

      const family = result.recordset[0];
      if (family.current_token_hash !== oldTokenHash) {
        // Reuse detected — revoke entire family
        await pool
          .request()
          .input("now", Date.now())
          .input("familyId", familyId)
          .query(
            "UPDATE refresh_token_families SET revoked = 1, updated_at = @now WHERE id = @familyId",
          );
        return err(conflict("Token reuse detected"));
      }

      await pool
        .request()
        .input("newTokenHash", newTokenHash)
        .input("now", Date.now())
        .input("familyId", familyId)
        .query(`
          UPDATE refresh_token_families
          SET current_token_hash = @newTokenHash, updated_at = @now
          WHERE id = @familyId
        `);
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async findByTokenHash(tokenHash: string): Promise<Result<RefreshTokenFamily | null, AppError>> {
    try {
      const result = await pool
        .request()
        .input("tokenHash", tokenHash)
        .query("SELECT * FROM refresh_token_families WHERE current_token_hash = @tokenHash");
      if (result.recordset.length === 0) return ok(null);
      return ok(toFamily(result.recordset[0] as Record<string, unknown>));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async revokeFamily(familyId: string): Promise<Result<void, AppError>> {
    try {
      await pool
        .request()
        .input("now", Date.now())
        .input("familyId", familyId)
        .query(
          "UPDATE refresh_token_families SET revoked = 1, updated_at = @now WHERE id = @familyId",
        );
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async revokeAllForUser(userId: UserId): Promise<Result<void, AppError>> {
    try {
      await pool
        .request()
        .input("now", Date.now())
        .input("userId", userId as string)
        .query(
          "UPDATE refresh_token_families SET revoked = 1, updated_at = @now WHERE user_id = @userId",
        );
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async prune(maxAgeMs: number): Promise<Result<number, AppError>> {
    try {
      const cutoff = Date.now() - maxAgeMs;
      const result = await pool
        .request()
        .input("cutoff", cutoff)
        .query("DELETE FROM refresh_token_families WHERE revoked = 1 AND updated_at < @cutoff");
      return ok(result.rowsAffected[0] ?? 0);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
