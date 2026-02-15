import type { UserRole } from "../entities/user.entity.js";
import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { Result } from "../types/result.js";

/**
 * Port: Token Service (JWT or similar)
 */
export interface TokenPayload {
  readonly sub: UserId;
  readonly role: UserRole;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface TokenService {
  sign(payload: TokenPayload): Promise<Result<TokenPair, AppError>>;
  verify(token: string): Promise<Result<TokenPayload, AppError>>;
  refresh(refreshToken: string): Promise<Result<TokenPair, AppError>>;
}
