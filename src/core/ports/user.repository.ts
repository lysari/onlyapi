import type { User, UserRole } from "../entities/user.entity.js";
import type { AppError } from "../errors/app-error.js";
import type { UserId } from "../types/brand.js";
import type { CursorParams, PaginatedResult } from "../types/pagination.js";
import type { Result } from "../types/result.js";

/**
 * Port: User Repository
 * Defines the contract the domain expects — infrastructure implements.
 */
export interface UserRepository {
  findById(id: UserId): Promise<Result<User, AppError>>;
  findByEmail(email: string): Promise<Result<User, AppError>>;
  create(data: CreateUserData): Promise<Result<User, AppError>>;
  update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>>;
  delete(id: UserId): Promise<Result<void, AppError>>;
  list(options: UserListOptions): Promise<Result<PaginatedResult<User>, AppError>>;
  count(): Promise<Result<number, AppError>>;
}

export interface CreateUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
}

export interface UpdateUserData {
  readonly email?: string | undefined;
  readonly passwordHash?: string | undefined;
  readonly role?: UserRole | undefined;
  readonly emailVerified?: boolean | undefined;
  readonly mfaEnabled?: boolean | undefined;
  readonly mfaSecret?: string | null | undefined;
  readonly passwordChangedAt?: number | undefined;
}

export interface UserListOptions extends CursorParams {
  readonly search?: string | undefined;
  readonly role?: UserRole | undefined;
}
