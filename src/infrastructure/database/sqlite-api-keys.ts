import type { Database } from "bun:sqlite";
import { type AppError, internal, notFound, unauthorized } from "../../core/errors/app-error.js";
import type { ApiKey, ApiKeyRepository } from "../../core/ports/api-key.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * SQLite-backed API key repository.
 * Keys are SHA-256 hashed before storage. Only the prefix is shown after creation.
 * Raw keys are returned exactly once on creation.
 */

const hashKey = async (raw: string): Promise<string> => {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const generateRawKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `oapi_${hex}`;
};

interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

const rowToApiKey = (row: ApiKeyRow): ApiKey => ({
  id: row.id,
  userId: brand<string, "UserId">(row.user_id),
  name: row.name,
  keyPrefix: row.key_prefix,
  scopes: JSON.parse(row.scopes) as string[],
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
});

export const createSqliteApiKeyRepository = (db: Database): ApiKeyRepository => {
  const insertStmt = db.prepare(
    "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)",
  );
  const findByHashStmt = db.prepare<ApiKeyRow, [string]>(
    "SELECT * FROM api_keys WHERE key_hash = ?",
  );
  const listByUserStmt = db.prepare<ApiKeyRow, [string]>(
    "SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
  );
  const deleteStmt = db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?");
  const touchStmt = db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?");

  return {
    async create(
      userId: UserId,
      name: string,
      scopes: readonly string[],
      expiresAt?: number,
    ): Promise<Result<{ key: ApiKey; rawKey: string }, AppError>> {
      try {
        const rawKey = generateRawKey();
        const keyHash = await hashKey(rawKey);
        const id = generateId();
        const now = Date.now();
        const keyPrefix = `${rawKey.substring(0, 12)}...`;

        insertStmt.run(
          id,
          userId,
          name,
          keyHash,
          keyPrefix,
          JSON.stringify(scopes),
          expiresAt ?? null,
          now,
        );

        const key: ApiKey = {
          id,
          userId,
          name,
          keyPrefix,
          scopes,
          expiresAt: expiresAt ?? null,
          lastUsedAt: null,
          createdAt: now,
        };

        return ok({ key, rawKey });
      } catch (e: unknown) {
        return err(internal("Failed to create API key", e));
      }
    },

    async verify(rawKey: string): Promise<Result<ApiKey, AppError>> {
      try {
        const keyHash = await hashKey(rawKey);
        const row = findByHashStmt.get(keyHash);
        if (!row) return err(unauthorized("Invalid API key"));

        // Check expiry
        if (row.expires_at !== null && row.expires_at <= Date.now()) {
          return err(unauthorized("API key has expired"));
        }

        return ok(rowToApiKey(row));
      } catch (e: unknown) {
        return err(internal("Failed to verify API key", e));
      }
    },

    async listByUser(userId: UserId): Promise<Result<readonly ApiKey[], AppError>> {
      try {
        const rows = listByUserStmt.all(userId);
        return ok(rows.map(rowToApiKey));
      } catch (e: unknown) {
        return err(internal("Failed to list API keys", e));
      }
    },

    async revoke(id: string, userId: UserId): Promise<Result<void, AppError>> {
      try {
        const result = deleteStmt.run(id, userId);
        if (result.changes === 0) return err(notFound("API key"));
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to revoke API key", e));
      }
    },

    async touch(id: string): Promise<Result<void, AppError>> {
      try {
        touchStmt.run(Date.now(), id);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to update API key usage", e));
      }
    },
  };
};
