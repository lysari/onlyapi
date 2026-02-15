import type { User } from "../../core/entities/user.entity.js";
import { type AppError, conflict, notFound } from "../../core/errors/app-error.js";
import type {
  CreateUserData,
  UpdateUserData,
  UserListOptions,
  UserRepository,
} from "../../core/ports/user.repository.js";
import type { UserId } from "../../core/types/brand.js";
import { brand } from "../../core/types/brand.js";
import { decodeCursor, encodeCursor } from "../../core/types/pagination.js";
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
        emailVerified: false,
        mfaEnabled: false,
        mfaSecret: null,
        passwordChangedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      store.set(user.id, user);
      return ok(user);
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: update handles many optional fields
    async update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>> {
      const existing = store.get(id);
      if (!existing) return err(notFound("User"));

      const updated: User = {
        ...existing,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.emailVerified !== undefined ? { emailVerified: data.emailVerified } : {}),
        ...(data.mfaEnabled !== undefined ? { mfaEnabled: data.mfaEnabled } : {}),
        ...(data.mfaSecret !== undefined ? { mfaSecret: data.mfaSecret } : {}),
        ...(data.passwordChangedAt !== undefined
          ? {
              passwordChangedAt: data.passwordChangedAt as
                | import("../../core/types/brand.js").Timestamp
                | null,
            }
          : {}),
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

    async list(options: UserListOptions) {
      let users = Array.from(store.values());

      // Sort by createdAt descending
      users.sort((a, b) => b.createdAt - a.createdAt);

      // Cursor filter
      if (options.cursor !== undefined) {
        const decoded = decodeCursor(options.cursor);
        if (decoded !== null) {
          const ts = Number(decoded);
          users = users.filter((u) => u.createdAt < ts);
        }
      }

      // Role filter
      if (options.role !== undefined) {
        users = users.filter((u) => u.role === options.role);
      }

      // Search filter
      if (options.search !== undefined) {
        const q = options.search.toLowerCase();
        users = users.filter((u) => u.email.includes(q));
      }

      const limit = Math.min(options.limit, 100);
      const hasMore = users.length > limit;
      const items = users.slice(0, limit);
      const lastItem = items[items.length - 1];
      const nextCursor =
        hasMore && lastItem !== undefined ? encodeCursor(String(lastItem.createdAt)) : null;

      return ok({ items, nextCursor, hasMore });
    },

    async count() {
      return ok(store.size);
    },
  };
};
