import type { AppError } from "../../core/errors/app-error.js";
import type { ApiKey, ApiKeyRepository } from "../../core/ports/api-key.js";
import type { Logger } from "../../core/ports/logger.js";
import type { UserId } from "../../core/types/brand.js";
import type { Result } from "../../core/types/result.js";

/**
 * API Key Service — manages API key lifecycle.
 */
export interface ApiKeyService {
  create(
    userId: UserId,
    name: string,
    scopes: readonly string[],
    expiresInDays?: number,
  ): Promise<Result<{ key: ApiKey; rawKey: string }, AppError>>;
  list(userId: UserId): Promise<Result<readonly ApiKey[], AppError>>;
  revoke(id: string, userId: UserId): Promise<Result<void, AppError>>;
  verify(rawKey: string): Promise<Result<ApiKey, AppError>>;
}

interface Deps {
  readonly apiKeyRepo: ApiKeyRepository;
  readonly logger: Logger;
}

export const createApiKeyService = (deps: Deps): ApiKeyService => {
  const { apiKeyRepo, logger } = deps;

  return {
    async create(userId: UserId, name: string, scopes: readonly string[], expiresInDays?: number) {
      logger.info("Creating API key", { userId, name });
      const expiresAt = expiresInDays
        ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000
        : undefined;
      const result = await apiKeyRepo.create(userId, name, scopes, expiresAt);
      if (result.ok) {
        logger.info("API key created", { userId, keyId: result.value.key.id });
      }
      return result;
    },

    async list(userId: UserId) {
      return apiKeyRepo.listByUser(userId);
    },

    async revoke(id: string, userId: UserId) {
      logger.info("Revoking API key", { userId, keyId: id });
      const result = await apiKeyRepo.revoke(id, userId);
      if (result.ok) {
        logger.info("API key revoked", { userId, keyId: id });
      }
      return result;
    },

    async verify(rawKey: string) {
      const result = await apiKeyRepo.verify(rawKey);
      if (result.ok) {
        // Touch asynchronously — don't wait
        apiKeyRepo.touch(result.value.id);
      }
      return result;
    },
  };
};
