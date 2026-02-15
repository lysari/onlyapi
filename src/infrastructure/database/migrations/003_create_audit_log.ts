import type { Database } from "bun:sqlite";

/**
 * Migration 003: Create audit_log table
 * Append-only ledger of significant system events.
 */
export const up = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      action      TEXT NOT NULL,
      resource    TEXT NOT NULL,
      resource_id TEXT,
      detail      TEXT,
      ip          TEXT NOT NULL,
      timestamp   INTEGER NOT NULL
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)");
  db.run("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)");
};

export const down = (db: Database): void => {
  db.run("DROP INDEX IF EXISTS idx_audit_log_timestamp");
  db.run("DROP INDEX IF EXISTS idx_audit_log_action");
  db.run("DROP INDEX IF EXISTS idx_audit_log_user");
  db.run("DROP TABLE IF EXISTS audit_log");
};
