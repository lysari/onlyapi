/**
 * Retry with exponential backoff — configurable retry policy for transient failures.
 *
 * Features:
 *   - Exponential backoff: delay = baseDelay × 2^attempt
 *   - Jitter: ±random factor to prevent thundering herd
 *   - Max delay cap
 *   - Retryable predicate for selective retry
 */

import type { RetryOptions, RetryPolicy } from "../../core/ports/retry.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const createRetryPolicy = (options: RetryOptions): RetryPolicy => {
  const { maxRetries, baseDelayMs, maxDelayMs, jitter, retryable, onRetry } = options;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error: unknown) {
          lastError = error;

          // Don't retry on final attempt
          if (attempt === maxRetries) break;

          // Check if error is retryable
          if (retryable && !retryable(error)) break;

          // Calculate delay with exponential backoff + jitter
          const exponentialDelay = baseDelayMs * 2 ** attempt;
          const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
          const jitterRange = cappedDelay * jitter;
          const jitterOffset = (Math.random() * 2 - 1) * jitterRange;
          const finalDelay = Math.max(0, Math.round(cappedDelay + jitterOffset));

          onRetry?.(attempt + 1, error, finalDelay);

          await sleep(finalDelay);
        }
      }

      throw lastError;
    },
  };
};
