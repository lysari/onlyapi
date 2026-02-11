import type { Result } from "../types/result.js";
import type { AppError } from "../errors/app-error.js";
import type { User, UserRole } from "../entities/user.entity.js";
import type { UserId } from "../types/brand.js";

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
}
