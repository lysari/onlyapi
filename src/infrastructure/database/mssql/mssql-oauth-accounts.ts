/**
 * SQL Server OAuth account repository adapter.
 */

import type sql from "mssql";
import { conflict, internal, notFound } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { OAuthAccount, OAuthAccountRepository } from "../../../core/ports/oauth.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

const toOAuthAccount = (row: Record<string, unknown>): OAuthAccount => ({
  id: row["id"] as string,
  userId: brand<string, "UserId">(row["user_id"] as string),
  provider: row["provider"] as string,
  providerUserId: row["provider_user_id"] as string,
  email: (row["email"] as string) ?? null,
  createdAt: Number(row["created_at"]),
});

export const createMssqlOAuthAccountRepo = (pool: sql.ConnectionPool): OAuthAccountRepository => ({
  async link(
    userId: UserId,
    provider: string,
    providerUserId: string,
    email: string | null,
  ): Promise<Result<OAuthAccount, AppError>> {
    try {
      const id = generateId();
      const now = Date.now();

      try {
        await pool
          .request()
          .input("id", id)
          .input("userId", userId as string)
          .input("provider", provider)
          .input("providerUserId", providerUserId)
          .input("email", email)
          .input("createdAt", now)
          .query(`
            INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at)
            VALUES (@id, @userId, @provider, @providerUserId, @email, @createdAt)
          `);
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          (e.message.includes("duplicate key") || e.message.includes("UNIQUE"))
        ) {
          return err(conflict("OAuth account already linked"));
        }
        throw e;
      }

      return ok({
        id,
        userId,
        provider,
        providerUserId,
        email,
        createdAt: now,
      });
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async findByProvider(
    provider: string,
    providerUserId: string,
  ): Promise<Result<OAuthAccount | null, AppError>> {
    try {
      const result = await pool
        .request()
        .input("provider", provider)
        .input("providerUserId", providerUserId)
        .query(`
          SELECT * FROM oauth_accounts
          WHERE provider = @provider AND provider_user_id = @providerUserId
        `);
      if (result.recordset.length === 0) return ok(null);
      return ok(toOAuthAccount(result.recordset[0] as Record<string, unknown>));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async listByUser(userId: UserId): Promise<Result<readonly OAuthAccount[], AppError>> {
    try {
      const result = await pool
        .request()
        .input("userId", userId as string)
        .query("SELECT * FROM oauth_accounts WHERE user_id = @userId ORDER BY created_at DESC");
      return ok(result.recordset.map((r: Record<string, unknown>) => toOAuthAccount(r)));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async unlink(id: string, userId: UserId): Promise<Result<void, AppError>> {
    try {
      const result = await pool
        .request()
        .input("id", id)
        .input("userId", userId as string)
        .query("SELECT id FROM oauth_accounts WHERE id = @id AND user_id = @userId");

      if (result.recordset.length === 0) return err(notFound("OAuth account"));

      await pool.request().input("id", id).query("DELETE FROM oauth_accounts WHERE id = @id");
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
