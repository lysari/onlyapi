import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

/**
 * Port: Password Hasher
 */
export interface PasswordHasher {
  hash(plain: string): Promise<Result<string, AppError>>;
  verify(plain: string, hash: string): Promise<Result<boolean, AppError>>;
}
