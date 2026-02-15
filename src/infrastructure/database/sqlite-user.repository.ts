import type { Database } from "bun:sqlite";
import type { User } from "../../core/entities/user.entity.js";
import type { UserRole } from "../../core/entities/user.entity.js";
import { type AppError, conflict, internal, notFound } from "../../core/errors/app-error.js";
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
 * SQLite user repository — zero external dependencies (bun:sqlite is built-in).
 * Production-ready persistence that swaps cleanly for the in-memory adapter.
 */

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
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
  createdAt: brand<number, "Timestamp">(row.created_at),
  updatedAt: brand<number, "Timestamp">(row.updated_at),
});

/** Build SET clause entries from partial update data */
const buildUpdateFields = (data: UpdateUserData, now: number): [string, unknown][] => {
  const fields: [string, unknown][] = [];
  if (data.email !== undefined) fields.push(["email = ?", data.email]);
  if (data.passwordHash !== undefined) fields.push(["password_hash = ?", data.passwordHash]);
  if (data.role !== undefined) fields.push(["role = ?", data.role]);
  fields.push(["updated_at = ?", now]);
  return fields;
};

/** Detect SQLite UNIQUE constraint violations */
const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("UNIQUE");

export const createSqliteUserRepository = (db: Database): UserRepository => {
  // Pre-compile queries for performance
  const findByIdStmt = db.prepare<UserRow, [string]>("SELECT * FROM users WHERE id = ?");
  const findByEmailStmt = db.prepare<UserRow, [string]>("SELECT * FROM users WHERE email = ?");
  const insertStmt = db.prepare(
    "INSERT INTO users (id, email, password_hash, role, failed_login_attempts, locked_until, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)",
  );
  const deleteStmt = db.prepare("DELETE FROM users WHERE id = ?");

  return {
    async findById(id: UserId): Promise<Result<User, AppError>> {
      try {
        const row = findByIdStmt.get(id);
        if (!row) return err(notFound("User"));
        return ok(rowToUser(row));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async findByEmail(email: string): Promise<Result<User, AppError>> {
      try {
        const row = findByEmailStmt.get(email);
        if (!row) return err(notFound("User"));
        return ok(rowToUser(row));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async create(data: CreateUserData): Promise<Result<User, AppError>> {
      try {
        const id = generateId();
        const now = Date.now();

        try {
          insertStmt.run(id, data.email, data.passwordHash, data.role, now, now);
        } catch (e: unknown) {
          if (isUniqueViolation(e)) return err(conflict("Email already exists"));
          throw e;
        }

        const user: User = {
          id: brand<string, "UserId">(id),
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          createdAt: brand<number, "Timestamp">(now),
          updatedAt: brand<number, "Timestamp">(now),
        };

        return ok(user);
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>> {
      try {
        const existing = findByIdStmt.get(id);
        if (!existing) return err(notFound("User"));

        const fieldMap = buildUpdateFields(data, Date.now());
        const sql = `UPDATE users SET ${fieldMap.map(([f]) => f).join(", ")} WHERE id = ?`;
        const values = [...fieldMap.map(([, v]) => v), id];
        db.run(sql, values as import("bun:sqlite").SQLQueryBindings[]);

        const updated = findByIdStmt.get(id);
        if (!updated) return err(internal("User disappeared after update"));
        return ok(rowToUser(updated));
      } catch (e: unknown) {
        if (isUniqueViolation(e)) return err(conflict("Email already exists"));
        return err(internal("Database error", e));
      }
    },

    async delete(id: UserId): Promise<Result<void, AppError>> {
      try {
        const existing = findByIdStmt.get(id);
        if (!existing) return err(notFound("User"));

        deleteStmt.run(id);
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },
  };
};

/**
 * Account lockout helpers — query/update failed login attempts directly.
 */
export const createAccountLockoutQueries = (db: Database) => {
  const getAttemptsStmt = db.prepare<
    { failed_login_attempts: number; locked_until: number | null },
    [string]
  >("SELECT failed_login_attempts, locked_until FROM users WHERE email = ?");

  const incrementFailedStmt = db.prepare(
    "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email = ?",
  );

  const lockAccountStmt = db.prepare(
    "UPDATE users SET locked_until = ?, failed_login_attempts = ? WHERE email = ?",
  );

  const resetAttemptsStmt = db.prepare(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?",
  );

  return {
    getAttempts(email: string) {
      return getAttemptsStmt.get(email);
    },
    incrementFailed(email: string) {
      incrementFailedStmt.run(email);
    },
    lockAccount(email: string, until: number, attempts: number) {
      lockAccountStmt.run(until, attempts, email);
    },
    resetAttempts(email: string) {
      resetAttemptsStmt.run(email);
    },
  };
};
