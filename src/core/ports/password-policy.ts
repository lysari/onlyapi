import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { PasswordHistory } from "./password-history.js";

/**
 * Port: Password Policy
 * Validates passwords against configured rules:
 * - Minimum length, uppercase, lowercase, digit, special char
 * - History check (no reuse of last N passwords)
 * - Expiry detection
 */
export interface PasswordPolicyConfig {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireDigit: boolean;
  readonly requireSpecial: boolean;
  readonly historyCount: number;
  readonly maxAgeDays: number; // 0 = no expiry
}

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

export interface PasswordPolicy {
  /** Validate a password against the policy rules (no history check) */
  validate(password: string): PasswordPolicyResult;
  /** Check if the password was recently used (requires DB lookup) */
  checkHistory(
    userId: UserId,
    password: string,
    passwordHasher: PasswordHasher,
    history: PasswordHistory,
  ): Promise<Result<boolean, AppError>>;
  /** Check if the user's password has expired */
  isExpired(passwordChangedAt: number | null): boolean;
  /** Get the current policy config */
  readonly config: PasswordPolicyConfig;
}
