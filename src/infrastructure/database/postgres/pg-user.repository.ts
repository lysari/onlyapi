/**
 * PostgreSQL user repository — uses Bun.sql (zero external deps).
 *
 * Drop-in replacement for SQLite adapter, implements the same UserRepository port.
 * Uses parameterized queries to prevent SQL injection.
 */

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
  emailVerified: row.email_verified,
  mfaEnabled: row.mfa_enabled,
  mfaSecret: row.mfa_secret,
  passwordChangedAt:
    row.password_changed_at !== null ? brand<number, "Timestamp">(row.password_changed_at) : null,
  createdAt: brand<number, "Timestamp">(row.created_at),
  updatedAt: brand<number, "Timestamp">(row.updated_at),
});

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error && (e.message.includes("duplicate key") || e.message.includes("unique"));

/** Map UpdateUserData fields to their SQL column names */
const UPDATE_FIELD_MAP: ReadonlyArray<[keyof UpdateUserData, string]> = [
  ["email", "email"],
  ["passwordHash", "password_hash"],
  ["role", "role"],
  ["emailVerified", "email_verified"],
  ["mfaEnabled", "mfa_enabled"],
  ["mfaSecret", "mfa_secret"],
  ["passwordChangedAt", "password_changed_at"],
];

/** Build SET clause and parameter array from update data */
const buildUpdateSets = (data: UpdateUserData): { sets: string[]; vals: unknown[] } => {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  for (const [field, column] of UPDATE_FIELD_MAP) {
    if (data[field] !== undefined) {
      sets.push(`${column} = $${idx++}`);
      vals.push(data[field]);
    }
  }

  sets.push(`updated_at = $${idx}`);
  vals.push(Date.now());

  return { sets, vals };
};

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql tagged template type
type PgClient = any;

export const createPgUserRepository = (sql: PgClient): UserRepository => {
  return {
    async findById(id: UserId): Promise<Result<User, AppError>> {
      try {
        const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
        if (rows.length === 0) return err(notFound("User"));
        return ok(rowToUser(rows[0] as UserRow));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async findByEmail(email: string): Promise<Result<User, AppError>> {
      try {
        const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (rows.length === 0) return err(notFound("User"));
        return ok(rowToUser(rows[0] as UserRow));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    async create(data: CreateUserData): Promise<Result<User, AppError>> {
      try {
        const id = generateId();
        const now = Date.now();

        try {
          await sql`
            INSERT INTO users (id, email, password_hash, role, email_verified, mfa_enabled, failed_login_attempts, created_at, updated_at)
            VALUES (${id}, ${data.email}, ${data.passwordHash}, ${data.role}, FALSE, FALSE, 0, ${now}, ${now})
          `;
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

    async update(id: UserId, data: UpdateUserData): Promise<Result<User, AppError>> {
      try {
        // Check existence first
        const existing = await sql`SELECT id FROM users WHERE id = ${id}`;
        if (existing.length === 0) return err(notFound("User"));

        const { sets, vals } = buildUpdateSets(data);

        vals.push(id); // WHERE clause param
        const whereIdx = vals.length;
        const query = `UPDATE users SET ${sets.join(", ")} WHERE id = $${whereIdx}`;

        try {
          await sql.unsafe(query, vals);
        } catch (e: unknown) {
          if (isUniqueViolation(e)) return err(conflict("Email already exists"));
          throw e;
        }

        const updated = await sql`SELECT * FROM users WHERE id = ${id}`;
        if (updated.length === 0) return err(internal("User disappeared after update"));
        return ok(rowToUser(updated[0] as UserRow));
      } catch (e: unknown) {
        if (isUniqueViolation(e)) return err(conflict("Email already exists"));
        return err(internal("Database error", e));
      }
    },

    async delete(id: UserId): Promise<Result<void, AppError>> {
      try {
        const existing = await sql`SELECT id FROM users WHERE id = ${id}`;
        if (existing.length === 0) return err(notFound("User"));

        await sql`DELETE FROM users WHERE id = ${id}`;
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SQL builder with cursor/filter/search needs branching
    async list(options: UserListOptions) {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 1;

        if (options.cursor !== undefined) {
          const decoded = decodeCursor(options.cursor);
          if (decoded !== null) {
            conditions.push(`created_at < $${idx++}`);
            params.push(Number(decoded));
          }
        }

        if (options.role !== undefined) {
          conditions.push(`role = $${idx++}`);
          params.push(options.role);
        }

        if (options.search !== undefined) {
          conditions.push(`email ILIKE $${idx++}`);
          params.push(`%${options.search}%`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = Math.min(options.limit, 100);
        params.push(limit + 1);

        const query = `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${idx}`;
        const rows = (await sql.unsafe(query, params)) as UserRow[];

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
        const rows = await sql`SELECT COUNT(*) as cnt FROM users`;
        return ok(Number(rows[0].cnt));
      } catch (e: unknown) {
        return err(internal("Database error", e));
      }
    },
  };
};
