import type { AppError } from "../../core/errors/app-error.js";
import type { AccountLockout } from "../../core/ports/account-lockout.js";
import { type Result, ok } from "../../core/types/result.js";

/**
 * In-memory account lockout tracker.
 * Locks account after maxAttempts failed logins for lockoutDurationMs.
 */

interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null;
}

interface LockoutConfig {
  readonly maxAttempts: number;
  readonly lockoutDurationMs: number;
}

export const createInMemoryAccountLockout = (
  config: LockoutConfig = { maxAttempts: 5, lockoutDurationMs: 15 * 60 * 1000 },
): AccountLockout => {
  const store = new Map<string, LockoutEntry>();

  return {
    async recordFailedAttempt(email: string): Promise<Result<boolean, AppError>> {
      let entry = store.get(email);
      if (!entry) {
        entry = { attempts: 0, lockedUntil: null };
        store.set(email, entry);
      }

      // If currently locked and lock hasn't expired, just report still locked
      if (entry.lockedUntil !== null && entry.lockedUntil > Date.now()) {
        return ok(true);
      }

      // If lock expired, reset
      if (entry.lockedUntil !== null && entry.lockedUntil <= Date.now()) {
        entry.attempts = 0;
        entry.lockedUntil = null;
      }

      entry.attempts++;

      if (entry.attempts >= config.maxAttempts) {
        entry.lockedUntil = Date.now() + config.lockoutDurationMs;
        return ok(true);
      }

      return ok(false);
    },

    async resetAttempts(email: string): Promise<Result<void, AppError>> {
      store.delete(email);
      return ok(undefined);
    },

    async isLocked(email: string): Promise<Result<number | null, AppError>> {
      const entry = store.get(email);
      if (!entry || entry.lockedUntil === null) return ok(null);

      if (entry.lockedUntil <= Date.now()) {
        // Lock expired — clean up
        entry.attempts = 0;
        entry.lockedUntil = null;
        return ok(null);
      }

      return ok(entry.lockedUntil);
    },
  };
};
