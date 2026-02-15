import type { User } from "../../core/entities/user.entity.js";
import { type AppError, conflict, notFound } from "../../core/errors/app-error.js";
import type {
  CreateUserData,
  UpdateUserData,
  UserRepository,
} from "../../core/ports/user.repository.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

/**
 * In-memory user repository — swap for Postgres/SQLite adapter in production.
 * Demonstrates the port/adapter contract; zero external DB deps by default.
 */
export const createInMemoryUserRepository = (): UserRepository => {
  const store = new Map<string, User>();

  return {
    async findById(id: UserId): Promise<Result<User, AppError>> {
      const user = store.get(id);
      return user ? ok(user) : err(notFound("User"));
    },

    async findByEmail(email: string): Promise<Result<User, AppError>> {
      for (const user of store.values()) {
        if (user.email === email) return ok(user);
      }
      return err(notFound("User"));
    },

    async create(data: CreateUserData): Promise<Result<User, AppError>> {
      // Check unique email
      for (const user of store.values()) {
        if (user.email === data.email) {
          return err(conflict("Email already exists"));
        }
      }

      const now = brand<number, "Timestamp">(Date.now());
      const user: User = {
        id: brand<string, "UserId">(generateId()),
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        createdAt: now,
        updatedAt: now,
      };

      store.set(user.id, user);
      return ok(user);
    },

    async update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>> {
      const existing = store.get(id);
      if (!existing) return err(notFound("User"));

      const updated: User = {
        ...existing,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        updatedAt: brand<number, "Timestamp">(Date.now()),
      };

      store.set(id, updated);
      return ok(updated);
    },

    async delete(id: UserId): Promise<Result<void, AppError>> {
      if (!store.has(id)) return err(notFound("User"));
      store.delete(id);
      return ok(undefined);
    },
  };
};
