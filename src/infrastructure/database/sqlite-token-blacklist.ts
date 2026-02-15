import type { Database } from "bun:sqlite";
import { type AppError, internal } from "../../core/errors/app-error.js";
import type { TokenBlacklist } from "../../core/ports/token-blacklist.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * SQLite-backed token blacklist — persists across restarts.
 * Requires migration 002_create_token_blacklist to be applied.
 */
export const createSqliteTokenBlacklist = (db: Database): TokenBlacklist => {
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO token_blacklist (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
  );
  const checkStmt = db.prepare<{ token_hash: string }, [string, number]>(
    "SELECT token_hash FROM token_blacklist WHERE token_hash = ? AND expires_at > ?",
  );
  const pruneStmt = db.prepare("DELETE FROM token_blacklist WHERE expires_at <= ?");

  return {
    async add(tokenHash: string, expiresAt: number): Promise<Result<void, AppError>> {
      try {
        insertStmt.run(tokenHash, expiresAt, Date.now());
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to blacklist token", e));
      }
    },

    async isBlacklisted(tokenHash: string): Promise<Result<boolean, AppError>> {
      try {
        const row = checkStmt.get(tokenHash, Date.now());
        return ok(row !== null);
      } catch (e: unknown) {
        return err(internal("Failed to check token blacklist", e));
      }
    },

    async prune(): Promise<Result<number, AppError>> {
      try {
        const result = pruneStmt.run(Date.now());
        return ok(result.changes);
      } catch (e: unknown) {
        return err(internal("Failed to prune token blacklist", e));
      }
    },
  };
};
