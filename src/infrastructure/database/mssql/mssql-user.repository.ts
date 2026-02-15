/**
 * SQL Server user repository — uses the `mssql` npm package.
 *
 * Drop-in replacement for the Postgres/SQLite adapters, implements the same UserRepository port.
 * Uses parameterized queries to prevent SQL injection.
 */

import type sql from "mssql";
import type { User, UserRole } from "../../../core/entities/user.entity.js";
import { type AppError, conflict, internal, notFound } from "../../../core/errors/app-error.js";
import type {
  CreateUserData,
  UpdateUserData,
  UserListOptions,
  UserRepository,
} from "../../../core/ports/user.repository.js";
import type { UserId } from "../../../core/types/brand.js";
import { brand } from "../../../core/types/brand.js";
import { decodeCursor, encodeCursor } from "../../../core/types/pagination.js";
import { type Result, err, ok } from "../../../core/types/result.js";
import { generateId } from "../../../shared/utils/id.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  email_verified: boolean;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  password_changed_at: number | null;
  failed_login_attempts: number;
  locked_until: number | null;
  created_at: number;
  updated_at: number;
}

const rowToUser = (row: UserRow): User => ({
  id: brand<string, "UserId">(row.id),
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role as UserRole,
  emailVerified: Boolean(row.email_verified),
  mfaEnabled: Boolean(row.mfa_enabled),
  mfaSecret: row.mfa_secret,
  passwordChangedAt:
    row.password_changed_at !== null ? brand<number, "Timestamp">(row.password_changed_at) : null,
  createdAt: brand<number, "Timestamp">(row.created_at),
  updatedAt: brand<number, "Timestamp">(row.updated_at),
});

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error &&
  (e.message.includes("duplicate key") ||
    e.message.includes("unique") ||
    e.message.includes("UNIQUE") ||
    e.message.includes("Violation of UNIQUE KEY"));

/** Map UpdateUserData fields to their SQL column names and mssql types */
const UPDATE_FIELD_MAP: ReadonlyArray<[keyof UpdateUserData, string]> = [
  ["email", "email"],
  ["passwordHash", "password_hash"],
  ["role", "role"],
  ["emailVerified", "email_verified"],
  ["mfaEnabled", "mfa_enabled"],
  ["mfaSecret", "mfa_secret"],
  ["passwordChangedAt", "password_changed_at"],
];

export const createMssqlUserRepository = (pool: sql.ConnectionPool): UserRepository => {
  return {
    async findById(id: UserId): Promise<Result<User, AppError>> {
      try {
        const result = await pool
          .request()
          .input("id", id as string)
          .query("SELECT * FROM users WHERE id = @id");
        if (result.recordset.length === 0) return err(notFound("User"));
        return ok(rowToUser(result.recordset[0] as UserRow));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async findByEmail(email: string): Promise<Result<User, AppError>> {
      try {
        const result = await pool
          .request()
          .input("email", email)
          .query("SELECT * FROM users WHERE email = @email");
        if (result.recordset.length === 0) return err(notFound("User"));
        return ok(rowToUser(result.recordset[0] as UserRow));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async create(data: CreateUserData): Promise<Result<User, AppError>> {
      try {
        const id = generateId();
        const now = Date.now();

        try {
          await pool
            .request()
            .input("id", id)
            .input("email", data.email)
            .input("passwordHash", data.passwordHash)
            .input("role", data.role)
            .input("now", now)
            .query(`
              INSERT INTO users (id, email, password_hash, role, email_verified, mfa_enabled, failed_login_attempts, created_at, updated_at)
              VALUES (@id, @email, @passwordHash, @role, 0, 0, 0, @now, @now)
            `);
        } catch (e: unknown) {
          if (isUniqueViolation(e)) return err(conflict("Email already exists"));
          throw e;
        }

        const user: User = {
          id: brand<string, "UserId">(id),
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          emailVerified: false,
          mfaEnabled: false,
          mfaSecret: null,
          passwordChangedAt: null,
          createdAt: brand<number, "Timestamp">(now),
          updatedAt: brand<number, "Timestamp">(now),
        };

        return ok(user);
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SQL builder with dynamic SET clauses needs branching
    async update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>> {
      try {
        // Check existence first
        const existing = await pool
          .request()
          .input("id", id as string)
          .query("SELECT id FROM users WHERE id = @id");
        if (existing.recordset.length === 0) return err(notFound("User"));

        // Build dynamic SET clause
        const sets: string[] = [];
        const req = pool.request();
        let paramIdx = 0;

        for (const [field, column] of UPDATE_FIELD_MAP) {
          if (data[field] !== undefined) {
            const paramName = `p${paramIdx++}`;
            sets.push(`${column} = @${paramName}`);
            req.input(paramName, data[field] as string | number | boolean | null);
          }
        }

        const updatedAtParam = `p${paramIdx}`;
        sets.push(`updated_at = @${updatedAtParam}`);
        req.input(updatedAtParam, Date.now());
        req.input("updateId", id as string);

        try {
          await req.query(`UPDATE users SET ${sets.join(", ")} WHERE id = @updateId`);
        } catch (e: unknown) {
          if (isUniqueViolation(e)) return err(conflict("Email already exists"));
          throw e;
        }

        const updated = await pool
          .request()
          .input("id", id as string)
          .query("SELECT * FROM users WHERE id = @id");
        if (updated.recordset.length === 0) return err(internal("User disappeared after update"));
        return ok(rowToUser(updated.recordset[0] as UserRow));
      } catch (e: unknown) {
        if (isUniqueViolation(e)) return err(conflict("Email already exists"));
        return err(internal("Database error", e));
      }
    },

    async delete(id: UserId): Promise<Result<void, AppError>> {
      try {
        const existing = await pool
          .request()
          .input("id", id as string)
          .query("SELECT id FROM users WHERE id = @id");
        if (existing.recordset.length === 0) return err(notFound("User"));

        await pool
          .request()
          .input("id", id as string)
          .query("DELETE FROM users WHERE id = @id");
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SQL builder with cursor/filter/search needs branching
    async list(options: UserListOptions) {
      try {
        const conditions: string[] = [];
        const req = pool.request();
        let paramIdx = 0;

        if (options.cursor !== undefined) {
          const decoded = decodeCursor(options.cursor);
          if (decoded !== null) {
            const paramName = `p${paramIdx++}`;
            conditions.push(`created_at < @${paramName}`);
            req.input(paramName, Number(decoded));
          }
        }

        if (options.role !== undefined) {
          const paramName = `p${paramIdx++}`;
          conditions.push(`role = @${paramName}`);
          req.input(paramName, options.role);
        }

        if (options.search !== undefined) {
          const paramName = `p${paramIdx++}`;
          conditions.push(`email LIKE @${paramName}`);
          req.input(paramName, `%${options.search}%`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = Math.min(options.limit, 100);
        const limitParam = `p${paramIdx}`;
        req.input(limitParam, limit + 1);

        const query = `SELECT TOP (@${limitParam}) * FROM users ${where} ORDER BY created_at DESC`;
        const result = await req.query(query);
        const rows = result.recordset as UserRow[];

        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map(rowToUser);

        const lastItem = items[items.length - 1];
        const nextCursor =
          hasMore && lastItem !== undefined ? encodeCursor(String(lastItem.createdAt)) : null;

        return ok({ items, nextCursor, hasMore });
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async count() {
      try {
        const result = await pool.request().query("SELECT COUNT(*) as cnt FROM users");
        return ok(Number(result.recordset[0].cnt));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },
  };
};
