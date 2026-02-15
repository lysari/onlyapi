import type { Database } from "bun:sqlite";
import { type AppError, conflict, internal, notFound } from "../../core/errors/app-error.js";
import type { OAuthAccount, OAuthAccountRepository } from "../../core/ports/oauth.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite-backed OAuth account repository.
 * Links external OAuth provider identities to internal user accounts.
 */

interface OAuthRow {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  email: string | null;
  created_at: number;
}

const rowToAccount = (row: OAuthRow): OAuthAccount => ({
  id: row.id,
  userId: brand<string, "UserId">(row.user_id),
  provider: row.provider,
  providerUserId: row.provider_user_id,
  email: row.email,
  createdAt: row.created_at,
});

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("UNIQUE");

export const createSqliteOAuthAccountRepo = (db: Database): OAuthAccountRepository => {
  const insertStmt = db.prepare(
    "INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const findByProviderStmt = db.prepare<OAuthRow, [string, string]>(
    "SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
  );
  const listByUserStmt = db.prepare<OAuthRow, [string]>(
    "SELECT * FROM oauth_accounts WHERE user_id = ? ORDER BY created_at DESC",
  );
  const deleteStmt = db.prepare("DELETE FROM oauth_accounts WHERE id = ? AND user_id = ?");

  return {
    async link(
      userId: UserId,
      provider: string,
      providerUserId: string,
      email: string | null,
    ): Promise<Result<OAuthAccount, AppError>> {
      try {
        const id = generateId();
        const now = Date.now();
        insertStmt.run(id, userId, provider, providerUserId, email, now);
        return ok({
          id,
          userId,
          provider,
          providerUserId,
          email,
          createdAt: now,
        });
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          return err(conflict("OAuth account already linked"));
        }
        return err(internal("Failed to link OAuth account", e));
      }
    },

    async findByProvider(
      provider: string,
      providerUserId: string,
    ): Promise<Result<OAuthAccount | null, AppError>> {
      try {
        const row = findByProviderStmt.get(provider, providerUserId);
        return ok(row ? rowToAccount(row) : null);
      } catch (e: unknown) {
        return err(internal("Failed to find OAuth account", e));
      }
    },

    async listByUser(userId: UserId): Promise<Result<readonly OAuthAccount[], AppError>> {
      try {
        const rows = listByUserStmt.all(userId);
        return ok(rows.map(rowToAccount));
      } catch (e: unknown) {
        return err(internal("Failed to list OAuth accounts", e));
      }
    },

    async unlink(id: string, userId: UserId): Promise<Result<void, AppError>> {
      try {
        const result = deleteStmt.run(id, userId);
        if (result.changes === 0) return err(notFound("OAuth account"));
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to unlink OAuth account", e));
      }
    },
  };
};
