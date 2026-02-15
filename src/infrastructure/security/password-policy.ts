import { type AppError, internal } from "../../core/errors/app-error.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import type { PasswordHistory } from "../../core/ports/password-history.js";
import type {
  PasswordPolicy,
  PasswordPolicyConfig,
  PasswordPolicyResult,
} from "../../core/ports/password-policy.js";
import type { UserId } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * Password policy validator.
 * Checks complexity rules, history reuse, and expiry.
 * Zero external dependencies.
 */

const SPECIAL_CHARS = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

export const createPasswordPolicy = (config: PasswordPolicyConfig): PasswordPolicy => ({
  config,

  validate(password: string): PasswordPolicyResult {
    const violations: string[] = [];

    if (password.length < config.minLength) {
      violations.push(`Password must be at least ${config.minLength} characters`);
    }
    if (config.requireUppercase && !/[A-Z]/.test(password)) {
      violations.push("Password must contain at least one uppercase letter");
    }
    if (config.requireLowercase && !/[a-z]/.test(password)) {
      violations.push("Password must contain at least one lowercase letter");
    }
    if (config.requireDigit && !/\d/.test(password)) {
      violations.push("Password must contain at least one digit");
    }
    if (config.requireSpecial && !SPECIAL_CHARS.test(password)) {
      violations.push("Password must contain at least one special character");
    }

    return { valid: violations.length === 0, violations };
  },

  async checkHistory(
    userId: UserId,
    password: string,
    passwordHasher: PasswordHasher,
    history: PasswordHistory,
  ): Promise<Result<boolean, AppError>> {
    if (config.historyCount <= 0) return ok(false);

    try {
      const recentResult = await history.getRecent(userId, config.historyCount);
      if (!recentResult.ok) return recentResult;

      for (const oldHash of recentResult.value) {
        const verifyResult = await passwordHasher.verify(password, oldHash);
        if (!verifyResult.ok) return verifyResult;
        if (verifyResult.value) {
          return ok(true); // password was recently used
        }
      }

      return ok(false);
    } catch (e: unknown) {
      return err(internal("Failed to check password history", e));
    }
  },

  isExpired(passwordChangedAt: number | null): boolean {
    if (config.maxAgeDays <= 0) return false;
    if (passwordChangedAt === null) return false;
    const maxAgeMs = config.maxAgeDays * 24 * 60 * 60 * 1000;
    return Date.now() - passwordChangedAt > maxAgeMs;
  },
});
