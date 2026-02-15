import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

/**
 * Port: Token Blacklist
 * Allows checking if a token has been revoked (e.g. on logout).
 * Infrastructure can implement this with in-memory Set, SQLite, or Redis.
 */
export interface TokenBlacklist {
  /** Add a token to the blacklist. expiresAt is epoch ms when the token naturally expires. */
  add(tokenHash: string, expiresAt: number): Promise<Result<void, AppError>>;
  /** Check whether a token hash is blacklisted */
  isBlacklisted(tokenHash: string): Promise<Result<boolean, AppError>>;
  /** Prune expired entries (housekeeping) */
  prune(): Promise<Result<number, AppError>>;
}
