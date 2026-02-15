import type { Database } from "bun:sqlite";
import { type AppError, internal, unauthorized } from "../../core/errors/app-error.js";
import type {
  VerificationTokenRepository,
  VerificationTokenType,
} from "../../core/ports/verification-token.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite-backed verification token repository.
 * Tokens are SHA-256 hashed before storage — raw tokens are never persisted.
 */

const hashToken = async (raw: string): Promise<string> => {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const generateRawToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

interface TokenRow {
  id: string;
  user_id: string;
  type: string;
  token_hash: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
}

export const createSqliteVerificationTokenRepo = (db: Database): VerificationTokenRepository => {
  const insertStmt = db.prepare(
    "INSERT INTO verification_tokens (id, user_id, type, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
  );
  const findByHashStmt = db.prepare<TokenRow, [string, string]>(
    "SELECT * FROM verification_tokens WHERE token_hash = ? AND type = ?",
  );
  const markUsedStmt = db.prepare("UPDATE verification_tokens SET used_at = ? WHERE id = ?");
  const invalidateStmt = db.prepare(
    "DELETE FROM verification_tokens WHERE user_id = ? AND type = ?",
  );
  const pruneStmt = db.prepare(
    "DELETE FROM verification_tokens WHERE expires_at <= ? OR used_at IS NOT NULL",
  );

  return {
    async create(
      userId: UserId,
      type: VerificationTokenType,
      ttlMs: number,
    ): Promise<Result<string, AppError>> {
      try {
        const rawToken = generateRawToken();
        const tokenHash = await hashToken(rawToken);
        const id = generateId();
        const now = Date.now();
        insertStmt.run(id, userId, type, tokenHash, now + ttlMs, now);
        return ok(rawToken);
      } catch (e: unknown) {
        return err(internal("Failed to create verification token", e));
      }
    },

    async verify(rawToken: string, type: VerificationTokenType): Promise<Result<UserId, AppError>> {
      try {
        const tokenHash = await hashToken(rawToken);
        const row = findByHashStmt.get(tokenHash, type);
        if (!row) return err(unauthorized("Invalid or expired token"));
        if (row.used_at !== null) return err(unauthorized("Token already used"));
        if (row.expires_at <= Date.now()) return err(unauthorized("Token has expired"));

        markUsedStmt.run(Date.now(), row.id);
        return ok(brand<string, "UserId">(row.user_id));
      } catch (e: unknown) {
        return err(internal("Failed to verify token", e));
      }
    },

    async invalidateAll(
      userId: UserId,
      type: VerificationTokenType,
    ): Promise<Result<void, AppError>> {
      try {
        invalidateStmt.run(userId, type);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to invalidate tokens", e));
      }
    },

    async prune(): Promise<Result<number, AppError>> {
      try {
        const result = pruneStmt.run(Date.now());
        return ok(result.changes);
      } catch (e: unknown) {
        return err(internal("Failed to prune verification tokens", e));
      }
    },
  };
};
