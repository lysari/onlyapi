import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: API Key Repository
 * Manages hashed API keys for service-to-service authentication.
 */

export interface ApiKey {
  readonly id: string;
  readonly userId: UserId;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number | null;
  readonly lastUsedAt: number | null;
  readonly createdAt: number;
}

export interface ApiKeyRepository {
  /** Create a new API key. Returns the full key (shown once). */
  create(
    userId: UserId,
    name: string,
    scopes: readonly string[],
    expiresAt?: number,
  ): Promise<Result<{ key: ApiKey; rawKey: string }, AppError>>;
  /** Verify a raw API key. Returns the key metadata if valid. */
  verify(rawKey: string): Promise<Result<ApiKey, AppError>>;
  /** List all API keys for a user (key hashes are never returned) */
  listByUser(userId: UserId): Promise<Result<readonly ApiKey[], AppError>>;
  /** Revoke (delete) an API key */
  revoke(id: string, userId: UserId): Promise<Result<void, AppError>>;
  /** Update last used timestamp */
  touch(id: string): Promise<Result<void, AppError>>;
}
