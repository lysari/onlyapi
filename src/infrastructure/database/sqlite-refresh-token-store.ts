import type { Database } from "bun:sqlite";
import { type AppError, internal, unauthorized } from "../../core/errors/app-error.js";
import type {
  RefreshTokenFamily,
  RefreshTokenStore,
} from "../../core/ports/refresh-token-store.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite-backed refresh token store with family tracking.
 * Enables refresh token rotation with reuse detection:
 * - Each login creates a new "family"
 * - Each refresh rotates the token within the family
 * - If an old token is reused → entire family is revoked (potential theft)
 */

interface FamilyRow {
  id: string;
  user_id: string;
  current_token_hash: string;
  revoked: number;
  created_at: number;
  updated_at: number;
}

const rowToFamily = (row: FamilyRow): RefreshTokenFamily => ({
  id: row.id,
  userId: brand<string, "UserId">(row.user_id),
  currentTokenHash: row.current_token_hash,
  revoked: row.revoked === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createSqliteRefreshTokenStore = (db: Database): RefreshTokenStore => {
  const insertStmt = db.prepare(
    "INSERT INTO refresh_token_families (id, user_id, current_token_hash, revoked, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  );
  const findByHashStmt = db.prepare<FamilyRow, [string]>(
    "SELECT * FROM refresh_token_families WHERE current_token_hash = ?",
  );
  const rotateStmt = db.prepare(
    "UPDATE refresh_token_families SET current_token_hash = ?, updated_at = ? WHERE id = ? AND current_token_hash = ?",
  );
  const revokeFamilyStmt = db.prepare(
    "UPDATE refresh_token_families SET revoked = 1, updated_at = ? WHERE id = ?",
  );
  const revokeAllStmt = db.prepare(
    "UPDATE refresh_token_families SET revoked = 1, updated_at = ? WHERE user_id = ?",
  );
  const pruneStmt = db.prepare("DELETE FROM refresh_token_families WHERE updated_at < ?");

  return {
    async createFamily(userId: UserId, tokenHash: string): Promise<Result<string, AppError>> {
      try {
        const id = generateId();
        const now = Date.now();
        insertStmt.run(id, userId, tokenHash, now, now);
        return ok(id);
      } catch (e: unknown) {
        return err(internal("Failed to create refresh token family", e));
      }
    },

    async rotate(
      familyId: string,
      oldTokenHash: string,
      newTokenHash: string,
    ): Promise<Result<void, AppError>> {
      try {
        const now = Date.now();
        const result = rotateStmt.run(newTokenHash, now, familyId, oldTokenHash);
        if (result.changes === 0) {
          return err(unauthorized("Token rotation failed — token mismatch"));
        }
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to rotate refresh token", e));
      }
    },

    async findByTokenHash(tokenHash: string): Promise<Result<RefreshTokenFamily | null, AppError>> {
      try {
        const row = findByHashStmt.get(tokenHash);
        return ok(row ? rowToFamily(row) : null);
      } catch (e: unknown) {
        return err(internal("Failed to find refresh token family", e));
      }
    },

    async revokeFamily(familyId: string): Promise<Result<void, AppError>> {
      try {
        revokeFamilyStmt.run(Date.now(), familyId);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to revoke refresh token family", e));
      }
    },

    async revokeAllForUser(userId: UserId): Promise<Result<void, AppError>> {
      try {
        revokeAllStmt.run(Date.now(), userId);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to revoke all refresh tokens", e));
      }
    },

    async prune(maxAgeMs: number): Promise<Result<number, AppError>> {
      try {
        const cutoff = Date.now() - maxAgeMs;
        const result = pruneStmt.run(cutoff);
        return ok(result.changes);
      } catch (e: unknown) {
        return err(internal("Failed to prune refresh token families", e));
      }
    },
  };
};
