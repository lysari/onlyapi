import type { Database } from "bun:sqlite";

/**
 * Migration 002: Create token blacklist table for logout
 */
export const up = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS token_blacklist (
      token_hash  TEXT PRIMARY KEY,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at)");
};

export const down = (db: Database): void => {
  db.run("DROP INDEX IF EXISTS idx_token_blacklist_expires");
  db.run("DROP TABLE IF EXISTS token_blacklist");
};
