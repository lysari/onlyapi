import type { Database } from "bun:sqlite";
import { type AppError, internal } from "../../core/errors/app-error.js";
import type { PasswordHistory } from "../../core/ports/password-history.js";
import type { UserId } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite-backed password history — stores past password hashes
 * to prevent reuse of recently used passwords.
 */

export const createSqlitePasswordHistory = (db: Database): PasswordHistory => {
  const insertStmt = db.prepare(
    "INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (?, ?, ?, ?)",
  );
  const getRecentStmt = db.prepare<{ password_hash: string }, [string, number]>(
    "SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
  );
  const pruneStmt = db.prepare(
    `DELETE FROM password_history WHERE id NOT IN (
      SELECT id FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    ) AND user_id = ?`,
  );

  return {
    async add(userId: UserId, passwordHash: string): Promise<Result<void, AppError>> {
      try {
        insertStmt.run(generateId(), userId, passwordHash, Date.now());
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to add password history", e));
      }
    },

    async getRecent(userId: UserId, count: number): Promise<Result<readonly string[], AppError>> {
      try {
        const rows = getRecentStmt.all(userId, count);
        return ok(rows.map((r) => r.password_hash));
      } catch (e: unknown) {
        return err(internal("Failed to get password history", e));
      }
    },

    async prune(userId: UserId, keepCount: number): Promise<Result<void, AppError>> {
      try {
        pruneStmt.run(userId, keepCount, userId);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to prune password history", e));
      }
    },
  };
};
