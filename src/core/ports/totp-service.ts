import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

/**
 * Port: TOTP Service
 * Time-based One-Time Password (RFC 6238) for MFA/2FA.
 * Compatible with Google Authenticator, Authy, etc.
 */
export interface TotpService {
  /** Generate a random TOTP secret (base32-encoded) */
  generateSecret(): string;
  /** Generate an otpauth:// URI for QR code display */
  generateUri(secret: string, email: string, issuer: string): string;
  /** Verify a TOTP code against a secret. Allows ±1 window for clock drift. */
  verify(secret: string, code: string): Result<boolean, AppError>;
}
