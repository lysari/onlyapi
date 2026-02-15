import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: OAuth Provider
 * Adapters for external OAuth2 providers (Google, GitHub, etc.)
 */

export interface OAuthUserInfo {
  readonly providerId: string;
  readonly email: string;
  readonly name?: string;
}

export interface OAuthProvider {
  /** Provider name (e.g., "google", "github") */
  readonly name: string;
  /** Build the authorization URL for the user to visit */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Exchange an authorization code for user info */
  exchangeCode(code: string, redirectUri: string): Promise<Result<OAuthUserInfo, AppError>>;
}

/**
 * Port: OAuth Account Repository
 * Links external OAuth identities to internal user accounts.
 */
export interface OAuthAccount {
  readonly id: string;
  readonly userId: UserId;
  readonly provider: string;
  readonly providerUserId: string;
  readonly email: string | null;
  readonly createdAt: number;
}

export interface OAuthAccountRepository {
  /** Link an OAuth identity to a user */
  link(
    userId: UserId,
    provider: string,
    providerUserId: string,
    email: string | null,
  ): Promise<Result<OAuthAccount, AppError>>;
  /** Find a user by their OAuth identity */
  findByProvider(
    provider: string,
    providerUserId: string,
  ): Promise<Result<OAuthAccount | null, AppError>>;
  /** List all OAuth accounts for a user */
  listByUser(userId: UserId): Promise<Result<readonly OAuthAccount[], AppError>>;
  /** Unlink an OAuth identity from a user */
  unlink(id: string, userId: UserId): Promise<Result<void, AppError>>;
}
