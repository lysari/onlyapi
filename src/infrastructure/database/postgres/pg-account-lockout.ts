/**
 * PostgreSQL account lockout adapter.
 */

import { internal } from "../../../core/errors/app-error.js";
import type { AppError } from "../../../core/errors/app-error.js";
import type { AccountLockout } from "../../../core/ports/account-lockout.js";
import { type Result, err, ok } from "../../../core/types/result.js";

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

interface LockoutOptions {
  readonly maxAttempts: number;
  readonly lockoutDurationMs: number;
}

export const createPgAccountLockout = (sql: PgClient, options: LockoutOptions): AccountLockout => ({
  async recordFailedAttempt(email: string): Promise<Result<boolean, AppError>> {
    try {
      await sql`
        UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email = ${email}
      `;
      const rows = await sql`
        SELECT failed_login_attempts FROM users WHERE email = ${email}
      `;
      if (rows.length === 0) return ok(false);

      const attempts = Number(rows[0].failed_login_attempts);
      if (attempts >= options.maxAttempts) {
        const lockUntil = Date.now() + options.lockoutDurationMs;
        await sql`
          UPDATE users SET locked_until = ${lockUntil}, failed_login_attempts = ${attempts} WHERE email = ${email}
        `;
        return ok(true);
      }
      return ok(false);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async resetAttempts(email: string): Promise<Result<void, AppError>> {
    try {
      await sql`
        UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ${email}
      `;
      return ok(undefined);
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },

  async isLocked(email: string): Promise<Result<number | null, AppError>> {
    try {
      const rows = await sql`
        SELECT locked_until FROM users WHERE email = ${email}
      `;
      if (rows.length === 0) return ok(null);

      const lockedUntil = rows[0].locked_until;
      if (lockedUntil === null || lockedUntil === undefined) return ok(null);
      if (Number(lockedUntil) <= Date.now()) {
        // Lock expired — clear it
        await sql`
          UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE email = ${email}
        `;
        return ok(null);
      }
      return ok(Number(lockedUntil));
    } catch (e: unknown) {
      return err(internal("Database error", e));
    }
  },
});
