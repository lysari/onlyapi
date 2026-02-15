import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: Password History
 * Stores past password hashes to prevent reuse.
 */
export interface PasswordHistoryEntry {
  readonly id: string;
  readonly userId: UserId;
  readonly passwordHash: string;
  readonly createdAt: number;
}

export interface PasswordHistory {
  /** Add a password hash to the user's history */
  add(userId: UserId, passwordHash: string): Promise<Result<void, AppError>>;
  /** Get the last N password hashes for a user */
  getRecent(userId: UserId, count: number): Promise<Result<readonly string[], AppError>>;
  /** Prune old history beyond the configured retention limit */
  prune(userId: UserId, keepCount: number): Promise<Result<void, AppError>>;
}
