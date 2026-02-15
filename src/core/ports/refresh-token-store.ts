import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: Refresh Token Family
 * Tracks refresh token families for rotation with reuse detection.
 * Each family represents a single login session.
 */

export interface RefreshTokenFamily {
  readonly id: string;
  readonly userId: UserId;
  readonly currentTokenHash: string;
  readonly revoked: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RefreshTokenStore {
  /** Create a new token family for a login session */
  createFamily(userId: UserId, tokenHash: string): Promise<Result<string, AppError>>;
  /** Rotate: set a new current token hash, return old hash for comparison */
  rotate(
    familyId: string,
    oldTokenHash: string,
    newTokenHash: string,
  ): Promise<Result<void, AppError>>;
  /** Find family by current token hash */
  findByTokenHash(tokenHash: string): Promise<Result<RefreshTokenFamily | null, AppError>>;
  /** Revoke an entire family (reuse detection) */
  revokeFamily(familyId: string): Promise<Result<void, AppError>>;
  /** Revoke all families for a user (logout-all) */
  revokeAllForUser(userId: UserId): Promise<Result<void, AppError>>;
  /** Prune expired/old families */
  prune(maxAgeMs: number): Promise<Result<number, AppError>>;
}
