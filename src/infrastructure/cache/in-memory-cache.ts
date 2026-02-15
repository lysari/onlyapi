/**
 * In-memory cache — zero-dep implementation for development / single-process.
 * Swap with Redis adapter for production multi-process deployments.
 */

import { internal } from "../../core/errors/app-error.js";
import type { AppError } from "../../core/errors/app-error.js";
import type { Cache } from "../../core/ports/cache.js";
import { type Result, err, ok } from "../../core/types/result.js";

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number | null; // null = no expiry
}

export const createInMemoryCache = (): Cache => {
  const store = new Map<string, CacheEntry>();

  /** Remove expired entries lazily */
  const isExpired = (entry: CacheEntry): boolean =>
    entry.expiresAt !== null && entry.expiresAt <= Date.now();

  return {
    async get<T = unknown>(key: string): Promise<Result<T | null, AppError>> {
      try {
        const entry = store.get(key);
        if (!entry || isExpired(entry)) {
          if (entry) store.delete(key);
          return ok(null);
        }
        return ok(entry.value as T);
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<Result<void, AppError>> {
      try {
        store.set(key, {
          value,
          expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : null,
        });
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async del(key: string): Promise<Result<boolean, AppError>> {
      try {
        return ok(store.delete(key));
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async has(key: string): Promise<Result<boolean, AppError>> {
      try {
        const entry = store.get(key);
        if (!entry || isExpired(entry)) {
          if (entry) store.delete(key);
          return ok(false);
        }
        return ok(true);
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async incr(key: string, delta = 1): Promise<Result<number, AppError>> {
      try {
        const entry = store.get(key);
        if (!entry || isExpired(entry)) {
          store.set(key, { value: delta, expiresAt: entry?.expiresAt ?? null });
          return ok(delta);
        }
        const newVal = (entry.value as number) + delta;
        entry.value = newVal;
        return ok(newVal);
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async delPattern(pattern: string): Promise<Result<number, AppError>> {
      try {
        // Convert glob pattern to regex
        const regexStr = pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".");
        const regex = new RegExp(`^${regexStr}$`);

        let count = 0;
        for (const key of store.keys()) {
          if (regex.test(key)) {
            store.delete(key);
            count++;
          }
        }
        return ok(count);
      } catch (e: unknown) {
        return err(internal("Cache error", e));
      }
    },

    async close(): Promise<void> {
      store.clear();
    },
  };
};
