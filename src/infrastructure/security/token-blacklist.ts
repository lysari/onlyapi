import type { AppError } from "../../core/errors/app-error.js";
import type { TokenBlacklist } from "../../core/ports/token-blacklist.js";
import { type Result, ok } from "../../core/types/result.js";

/**
 * In-memory token blacklist — suitable for single-process deployments.
 * For multi-process / clustered deployments, swap for Redis-backed adapter.
 */
export const createInMemoryTokenBlacklist = (): TokenBlacklist => {
  const store = new Map<string, number>(); // tokenHash → expiresAt
  let lastPrune = 0;

  return {
    async add(tokenHash: string, expiresAt: number): Promise<Result<void, AppError>> {
      store.set(tokenHash, expiresAt);
      return ok(undefined);
    },

    async isBlacklisted(tokenHash: string): Promise<Result<boolean, AppError>> {
      const expiresAt = store.get(tokenHash);
      if (expiresAt === undefined) return ok(false);
      // Auto-remove expired entries on read
      if (expiresAt <= Date.now()) {
        store.delete(tokenHash);
        return ok(false);
      }
      return ok(true);
    },

    async prune(): Promise<Result<number, AppError>> {
      const now = Date.now();
      if (now - lastPrune < 60_000) return ok(0); // at most once per minute
      lastPrune = now;

      let pruned = 0;
      for (const [hash, expiresAt] of store) {
        if (expiresAt <= now) {
          store.delete(hash);
          pruned++;
        }
      }
      return ok(pruned);
    },
  };
};
