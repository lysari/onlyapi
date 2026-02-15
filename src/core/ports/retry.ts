/**
 * Retry policy port — configurable retry with backoff for transient failures.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  readonly baseDelayMs: number;
  /** Maximum delay cap in ms (default: 5000) */
  readonly maxDelayMs: number;
  /** Jitter factor 0–1 (default: 0.2) */
  readonly jitter: number;
  /** Predicate: should this error be retried? (default: all errors) */
  readonly retryable?: (error: unknown) => boolean;
  /** Called on each retry attempt */
  readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export interface RetryPolicy {
  /** Execute a function with retry logic */
  execute<T>(fn: () => Promise<T>): Promise<T>;
}
