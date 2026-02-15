import { type AppError, rateLimited } from "../../core/errors/app-error.js";
import { type Result, err, ok } from "../../core/types/result.js";
import type { AppConfig } from "../../infrastructure/config/config.js";

/**
 * Fixed-window rate limiter — in-memory, O(1) per check.
 * Automatically prunes expired entries.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let lastPrune = Date.now();

const prune = (): void => {
  const now = Date.now();
  if (now - lastPrune < 60_000) return; // prune at most once per minute
  lastPrune = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
};

export interface RateLimitResult {
  readonly remaining: number;
  readonly resetAt: number;
}

export const checkRateLimit = (
  config: AppConfig,
  key: string,
): Result<RateLimitResult, AppError> => {
  prune();

  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const max = config.rateLimit.maxRequests;

  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  if (entry.count > max) {
    return err(rateLimited());
  }

  return ok({ remaining: max - entry.count, resetAt: entry.resetAt });
};

export const rateLimitHeaders = (result: RateLimitResult, max: number): Record<string, string> => ({
  "X-RateLimit-Limit": String(max),
  "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
  "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
});

/** Reset for testing */
export const resetRateLimitStore = (): void => {
  store.clear();
};
