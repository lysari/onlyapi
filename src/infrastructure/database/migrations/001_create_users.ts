import type { Database } from "bun:sqlite";

/**
 * Migration 001: Create users table
 */
export const up = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);

  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
};

export const down = (db: Database): void => {
  db.run("DROP INDEX IF EXISTS idx_users_email");
  db.run("DROP TABLE IF EXISTS users");
};
