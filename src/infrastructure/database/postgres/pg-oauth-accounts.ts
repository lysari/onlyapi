/**
 * PostgreSQL OAuth account repository adapter.
 */

import { conflict, internal, notFound } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { OAuthAccount, OAuthAccountRepository } from "../../../core/ports/oauth.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

const toOAuthAccount = (row: Record<string, unknown>): OAuthAccount => ({
  id: row["id"] as string,
  userId: brand<string, "UserId">(row["user_id"] as string),
  provider: row["provider"] as string,
  providerUserId: row["provider_user_id"] as string,
  email: (row["email"] as string) ?? null,
  createdAt: Number(row["created_at"]),
});

export const createPgOAuthAccountRepo = (sql: PgClient): OAuthAccountRepository => ({
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
        await sql`
          INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at)
          VALUES (${id}, ${userId as string}, ${provider}, ${providerUserId}, ${email}, ${now})
        `;
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("duplicate key")) {
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
      const rows = await sql`
        SELECT * FROM oauth_accounts
        WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
      `;
      if (rows.length === 0) return ok(null);
      return ok(toOAuthAccount(rows[0] as Record<string, unknown>));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async listByUser(userId: UserId): Promise<Result<readonly OAuthAccount[], AppError>> {
    try {
      const rows = await sql`
        SELECT * FROM oauth_accounts WHERE user_id = ${userId as string} ORDER BY created_at DESC
      `;
      return ok(rows.map((r: Record<string, unknown>) => toOAuthAccount(r)));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async unlink(id: string, userId: UserId): Promise<Result<void, AppError>> {
    try {
      const rows = await sql`
        SELECT id FROM oauth_accounts WHERE id = ${id} AND user_id = ${userId as string}
      `;
      if (rows.length === 0) return err(notFound("OAuth account"));

      await sql`DELETE FROM oauth_accounts WHERE id = ${id}`;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
