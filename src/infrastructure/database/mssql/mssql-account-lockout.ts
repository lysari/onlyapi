/**
 * SQL Server account lockout adapter.
 */

import type sql from "mssql";
import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { AccountLockout } from "../../../core/ports/account-lockout.js";
import { type Result, err, ok } from "../../../core/types/result.js";

interface LockoutOptions {
  readonly maxAttempts: number;
  readonly lockoutDurationMs: number;
}

export const createMssqlAccountLockout = (
  pool: sql.ConnectionPool,
  options: LockoutOptions,
): AccountLockout => ({
  async recordFailedAttempt(email: string): Promise<Result<boolean, AppError>> {
    try {
      await pool
        .request()
        .input("email", email)
        .query(
          "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email = @email",
        );

      const result = await pool
        .request()
        .input("email", email)
        .query("SELECT failed_login_attempts FROM users WHERE email = @email");

      if (result.recordset.length === 0) return ok(false);

      const attempts = Number(result.recordset[0].failed_login_attempts);
      if (attempts >= options.maxAttempts) {
        const lockUntil = Date.now() + options.lockoutDurationMs;
        await pool
          .request()
          .input("lockUntil", lockUntil)
          .input("attempts", attempts)
          .input("email", email)
          .query(
            "UPDATE users SET locked_until = @lockUntil, failed_login_attempts = @attempts WHERE email = @email",
          );
        return ok(true);
      }
      return ok(false);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async resetAttempts(email: string): Promise<Result<void, AppError>> {
    try {
      await pool
        .request()
        .input("email", email)
        .query(
          "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = @email",
        );
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async isLocked(email: string): Promise<Result<number | null, AppError>> {
    try {
      const result = await pool
        .request()
        .input("email", email)
        .query("SELECT locked_until FROM users WHERE email = @email");

      if (result.recordset.length === 0) return ok(null);

      const lockedUntil = result.recordset[0].locked_until;
      if (lockedUntil === null || lockedUntil === undefined) return ok(null);
      if (Number(lockedUntil) <= Date.now()) {
        // Lock expired — clear it
        await pool
          .request()
          .input("email", email)
          .query(
            "UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE email = @email",
          );
        return ok(null);
      }
      return ok(Number(lockedUntil));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
