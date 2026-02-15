import type { Database } from "bun:sqlite";
import type { Logger } from "../../../core/ports/logger.js";

/**
 * Database migration runner.
 * Tracks applied migrations in a `_migrations` table.
 * Supports up/down with versioned TypeScript migration files.
 */

interface Migration {
  readonly version: string;
  readonly name: string;
  readonly up: (db: Database) => void;
  readonly down: (db: Database) => void;
}

/** Initialize the migrations tracking table */
const ensureMigrationsTable = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  INTEGER NOT NULL
    )
  `);
};

/** Get all applied migration versions */
const getAppliedVersions = (db: Database): Set<string> => {
  const rows = db.query("SELECT version FROM _migrations ORDER BY version").all() as Array<{
    version: string;
  }>;
  return new Set(rows.map((r) => r.version));
};

/** Load all migrations from the migrations directory */
const loadMigrations = async (): Promise<Migration[]> => {
  const { up: up001, down: down001 } = await import("./001_create_users.js");
  const { up: up002, down: down002 } = await import("./002_create_token_blacklist.js");
  const { up: up003, down: down003 } = await import("./003_create_audit_log.js");
  const { up: up004, down: down004 } = await import("./004_auth_platform.js");

  return [
    { version: "001", name: "create_users", up: up001, down: down001 },
    { version: "002", name: "create_token_blacklist", up: up002, down: down002 },
    { version: "003", name: "create_audit_log", up: up003, down: down003 },
    { version: "004", name: "auth_platform", up: up004, down: down004 },
  ];
};

/**
 * Run all pending migrations (up).
 * Returns the number of migrations applied.
 */
export const migrateUp = async (db: Database, logger: Logger): Promise<number> => {
  ensureMigrationsTable(db);
  const applied = getAppliedVersions(db);
  const migrations = await loadMigrations();
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    logger.info(`Applying migration ${migration.version}: ${migration.name}`);

    db.transaction(() => {
      migration.up(db);
      db.run("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.name,
        Date.now(),
      ]);
    })();

    count++;
    logger.info(`Migration ${migration.version} applied successfully`);
  }

  if (count === 0) {
    logger.debug("No pending migrations");
  } else {
    logger.info(`Applied ${count} migration(s)`);
  }

  return count;
};

/**
 * Rollback the last applied migration (down).
 * Returns the version that was rolled back, or null if nothing to rollback.
 */
export const migrateDown = async (db: Database, logger: Logger): Promise<string | null> => {
  ensureMigrationsTable(db);
  const migrations = await loadMigrations();

  const lastApplied = db
    .query("SELECT version FROM _migrations ORDER BY version DESC LIMIT 1")
    .get() as { version: string } | null;

  if (!lastApplied) {
    logger.info("No migrations to rollback");
    return null;
  }

  const migration = migrations.find((m) => m.version === lastApplied.version);
  if (!migration) {
    logger.error(`Migration ${lastApplied.version} not found in migration files`);
    return null;
  }

  logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);

  db.transaction(() => {
    migration.down(db);
    db.run("DELETE FROM _migrations WHERE version = ?", [migration.version]);
  })();

  logger.info(`Migration ${migration.version} rolled back successfully`);
  return migration.version;
};
