/**
 * PostgreSQL API key repository adapter.
 */

import { internal, notFound } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { ApiKey, ApiKeyRepository } from "../../../core/ports/api-key.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

const KEY_PREFIX = "oapi_";

const rowToApiKey = (row: Record<string, unknown>): ApiKey => ({
  id: row["id"] as string,
  userId: brand<string, "UserId">(row["user_id"] as string),
  name: row["name"] as string,
  keyPrefix: row["key_prefix"] as string,
  scopes: JSON.parse((row["scopes"] as string) || "[]") as readonly string[],
  expiresAt: row["expires_at"] !== null ? Number(row["expires_at"]) : null,
  lastUsedAt: row["last_used_at"] !== null ? Number(row["last_used_at"]) : null,
  createdAt: Number(row["created_at"]),
});

export const createPgApiKeyRepository = (sql: PgClient): ApiKeyRepository => ({
  async create(
    userId: UserId,
    name: string,
    scopes: readonly string[],
    expiresAt?: number,
  ): Promise<Result<{ key: ApiKey; rawKey: string }, AppError>> {
    try {
      const id = generateId();
      const rawKey = `${KEY_PREFIX}${generateId()}${generateId()}`;
      const prefix = rawKey.substring(0, KEY_PREFIX.length + 8);

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
      const keyHash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const now = Date.now();

      await sql`
        INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at, created_at)
        VALUES (${id}, ${userId as string}, ${name}, ${keyHash}, ${prefix}, ${JSON.stringify(scopes)}, ${expiresAt ?? null}, ${now})
      `;

      const key: ApiKey = {
        id,
        userId,
        name,
        keyPrefix: prefix,
        scopes,
        expiresAt: expiresAt ?? null,
        lastUsedAt: null,
        createdAt: now,
      };

      return ok({ key, rawKey });
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async verify(rawKey: string): Promise<Result<ApiKey, AppError>> {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
      const keyHash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const rows = await sql`SELECT * FROM api_keys WHERE key_hash = ${keyHash}`;
      if (rows.length === 0) return err(notFound("API key"));

      const key = rowToApiKey(rows[0] as Record<string, unknown>);
      if (key.expiresAt !== null && key.expiresAt < Date.now()) {
        return err(notFound("API key"));
      }

      return ok(key);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async listByUser(userId: UserId): Promise<Result<readonly ApiKey[], AppError>> {
    try {
      const rows = await sql`
        SELECT * FROM api_keys WHERE user_id = ${userId as string} ORDER BY created_at DESC
      `;
      return ok(rows.map((r: Record<string, unknown>) => rowToApiKey(r)));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async revoke(id: string, userId: UserId): Promise<Result<void, AppError>> {
    try {
      const rows = await sql`
        SELECT id FROM api_keys WHERE id = ${id} AND user_id = ${userId as string}
      `;
      if (rows.length === 0) return err(notFound("API key"));

      await sql`DELETE FROM api_keys WHERE id = ${id}`;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async touch(id: string): Promise<Result<void, AppError>> {
    try {
      await sql`UPDATE api_keys SET last_used_at = ${Date.now()} WHERE id = ${id}`;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
