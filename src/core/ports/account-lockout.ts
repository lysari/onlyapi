import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

/**
 * Port: Account Lockout
 * Tracks failed login attempts and determines if an account is locked.
 */
export interface AccountLockout {
  /** Record a failed login attempt. Returns whether the account is now locked. */
  recordFailedAttempt(email: string): Promise<Result<boolean, AppError>>;
  /** Reset failed attempts on successful login */
  resetAttempts(email: string): Promise<Result<void, AppError>>;
  /** Check if account is currently locked. Returns lock expiry time or null. */
  isLocked(email: string): Promise<Result<number | null, AppError>>;
}
