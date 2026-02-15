/**
 * Port: Cache — generic key-value cache abstraction.
 * Implementations: in-memory (Map), Redis.
 */

import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

export interface Cache {
  /** Get a value by key. Returns null if not found or expired. */
  get<T = unknown>(key: string): Promise<Result<T | null, AppError>>;
  /** Set a value with optional TTL in milliseconds. */
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<Result<void, AppError>>;
  /** Delete a key. Returns true if it existed. */
  del(key: string): Promise<Result<boolean, AppError>>;
  /** Check if a key exists. */
  has(key: string): Promise<Result<boolean, AppError>>;
  /** Increment a numeric value by delta (default 1). Creates with value=delta if key absent. */
  incr(key: string, delta?: number): Promise<Result<number, AppError>>;
  /** Delete all keys matching a glob pattern (e.g. "rate:*"). */
  delPattern(pattern: string): Promise<Result<number, AppError>>;
  /** Close the connection / release resources. */
  close(): Promise<void>;
}
