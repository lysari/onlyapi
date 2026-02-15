import type { Database } from "bun:sqlite";
import { type AppError, internal } from "../../core/errors/app-error.js";
import type { AccountLockout } from "../../core/ports/account-lockout.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * SQLite-backed account lockout — persists across restarts.
 * Uses the failed_login_attempts and locked_until columns on the users table.
 */

interface LockoutConfig {
  readonly maxAttempts: number;
  readonly lockoutDurationMs: number;
}

export const createSqliteAccountLockout = (
  db: Database,
  config: LockoutConfig = { maxAttempts: 5, lockoutDurationMs: 15 * 60 * 1000 },
): AccountLockout => {
  const getStmt = db.prepare<
    { failed_login_attempts: number; locked_until: number | null },
    [string]
  >("SELECT failed_login_attempts, locked_until FROM users WHERE email = ?");

  const incrementStmt = db.prepare(
    "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email = ?",
  );

  const lockStmt = db.prepare(
    "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE email = ?",
  );

  const resetStmt = db.prepare(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?",
  );

  return {
    async recordFailedAttempt(email: string): Promise<Result<boolean, AppError>> {
      try {
        const row = getStmt.get(email);
        if (!row) return ok(false); // User doesn't exist — don't reveal that

        const now = Date.now();

        // If currently locked and not expired
        if (row.locked_until !== null && row.locked_until > now) {
          return ok(true);
        }

        // If lock expired, reset first
        if (row.locked_until !== null && row.locked_until <= now) {
          resetStmt.run(email);
          incrementStmt.run(email);
          return ok(false);
        }

        incrementStmt.run(email);
        const newCount = row.failed_login_attempts + 1;

        if (newCount >= config.maxAttempts) {
          lockStmt.run(newCount, now + config.lockoutDurationMs, email);
          return ok(true);
        }

        return ok(false);
      } catch (e: unknown) {
        return err(internal("Failed to record login attempt", e));
      }
    },

    async resetAttempts(email: string): Promise<Result<void, AppError>> {
      try {
        resetStmt.run(email);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Failed to reset login attempts", e));
      }
    },

    async isLocked(email: string): Promise<Result<number | null, AppError>> {
      try {
        const row = getStmt.get(email);
        if (!row || row.locked_until === null) return ok(null);

        if (row.locked_until <= Date.now()) {
          // Lock expired — reset
          resetStmt.run(email);
          return ok(null);
        }

        return ok(row.locked_until);
      } catch (e: unknown) {
        return err(internal("Failed to check lockout status", e));
      }
    },
  };
};
