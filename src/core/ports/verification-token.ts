import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: Verification Token Repository
 * Handles time-limited tokens for email verification and password reset.
 */

export const VerificationTokenType = {
  EMAIL_VERIFICATION: "email_verification",
  PASSWORD_RESET: "password_reset",
} as const;

export type VerificationTokenType =
  (typeof VerificationTokenType)[keyof typeof VerificationTokenType];

export interface VerificationToken {
  readonly id: string;
  readonly userId: UserId;
  readonly type: VerificationTokenType;
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly usedAt: number | null;
  readonly createdAt: number;
}

export interface VerificationTokenRepository {
  /** Create a new verification token. Returns the raw (unhashed) token. */
  create(
    userId: UserId,
    type: VerificationTokenType,
    ttlMs: number,
  ): Promise<Result<string, AppError>>;
  /** Verify and consume a token. Marks it as used. Returns the userId. */
  verify(rawToken: string, type: VerificationTokenType): Promise<Result<UserId, AppError>>;
  /** Invalidate all tokens for a user of a given type */
  invalidateAll(userId: UserId, type: VerificationTokenType): Promise<Result<void, AppError>>;
  /** Prune expired tokens */
  prune(): Promise<Result<number, AppError>>;
}
