import type { UserRepository } from "../../core/ports/user.repository.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import type { Logger } from "../../core/ports/logger.js";
import type { User } from "../../core/entities/user.entity.js";
import type { UserId } from "../../core/types/brand.js";
import type { AppError } from "../../core/errors/app-error.js";
import type { Result } from "../../core/types/result.js";
import { ok } from "../../core/types/result.js";
import type { UpdateUserDto } from "../dtos/auth.dto.js";

/** Safe user projection — strips sensitive fields */
export interface UserView {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const toView = (u: User): UserView => ({
  id: u.id,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

export interface UserService {
  getById(id: UserId): Promise<Result<UserView, AppError>>;
  update(id: UserId, dto: UpdateUserDto): Promise<Result<UserView, AppError>>;
  remove(id: UserId): Promise<Result<void, AppError>>;
}

interface Deps {
  readonly userRepo: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly logger: Logger;
}

export const createUserService = (deps: Deps): UserService => {
  const { userRepo, passwordHasher, logger } = deps;

  return {
    async getById(id: UserId): Promise<Result<UserView, AppError>> {
      logger.debug("Fetching user profile", { userId: id });

      const result = await userRepo.findById(id);
      if (!result.ok) {
        logger.warn("User not found", { userId: id });
        return result;
      }
      return ok(toView(result.value));
    },

    async update(id: UserId, dto: UpdateUserDto): Promise<Result<UserView, AppError>> {
      const fields = Object.keys(dto).filter((k) => dto[k as keyof UpdateUserDto] !== undefined);
      logger.info("Updating user", { userId: id, fields });

      let passwordHash: string | undefined;
      if (dto.password !== undefined) {
        const hashResult = await passwordHasher.hash(dto.password);
        if (!hashResult.ok) {
          logger.error("Password hashing failed during update", { userId: id });
          return hashResult;
        }
        passwordHash = hashResult.value;
      }

      const result = await userRepo.update(id, {
        email: dto.email,
        passwordHash,
      });
      if (!result.ok) {
        logger.warn("User update failed", { userId: id, code: result.error.code });
        return result;
      }

      logger.info("User updated", { userId: id, fields });
      return ok(toView(result.value));
    },

    async remove(id: UserId): Promise<Result<void, AppError>> {
      logger.info("Deleting user", { userId: id });

      const result = await userRepo.delete(id);
      if (!result.ok) {
        logger.warn("User deletion failed", { userId: id, code: result.error.code });
        return result;
      }

      logger.info("User deleted", { userId: id });
      return result;
    },
  };
};
