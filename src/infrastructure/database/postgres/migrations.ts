/**
 * Postgres migration runner — uses Bun.sql (zero external deps).
 *
 * Mirrors the SQLite migration runner pattern but uses PostgreSQL DDL.
 * Migrations are idempotent and wrapped in transactions.
 */

import type { Logger } from "../../../core/ports/logger.js";

interface PgMigration {
  readonly version: string;
  readonly name: string;
  readonly up: string; // raw SQL
  readonly down: string;
}

/**
 * All Postgres migrations — inlined SQL strings.
 * PostgreSQL uses BIGINT for timestamps (ms since epoch), TEXT for IDs,
 * BOOLEAN instead of INTEGER 0/1.
 */
const migrations: readonly PgMigration[] = [
  {
    version: "001",
    name: "create_users",
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id                    TEXT PRIMARY KEY,
        email                 TEXT NOT NULL UNIQUE,
        password_hash         TEXT NOT NULL,
        role                  TEXT NOT NULL DEFAULT 'user',
        email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret            TEXT,
        mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
        password_changed_at   BIGINT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until          BIGINT,
        created_at            BIGINT NOT NULL,
        updated_at            BIGINT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `,
    down: `
      DROP INDEX IF EXISTS idx_users_email;
      DROP TABLE IF EXISTS users;
    `,
  },
  {
    version: "002",
    name: "create_token_blacklist",
    up: `
      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash  TEXT PRIMARY KEY,
        expires_at  BIGINT NOT NULL,
        created_at  BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_token_blacklist_expires;
      DROP TABLE IF EXISTS token_blacklist;
    `,
  },
  {
    version: "003",
    name: "create_audit_log",
    up: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        action      TEXT NOT NULL,
        resource    TEXT NOT NULL,
        resource_id TEXT,
        detail      TEXT,
        ip          TEXT NOT NULL,
        timestamp   BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    `,
    down: `
      DROP INDEX IF EXISTS idx_audit_log_timestamp;
      DROP INDEX IF EXISTS idx_audit_log_action;
      DROP INDEX IF EXISTS idx_audit_log_user;
      DROP TABLE IF EXISTS audit_log;
    `,
  },
  {
    version: "004",
    name: "auth_platform",
    up: `
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
        token_hash  TEXT NOT NULL UNIQUE,
        expires_at  BIGINT NOT NULL,
        used_at     BIGINT,
        created_at  BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens(user_id, type);

      CREATE TABLE IF NOT EXISTS refresh_token_families (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_token_hash  TEXT NOT NULL,
        revoked             BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          BIGINT NOT NULL,
        updated_at          BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_families_user ON refresh_token_families(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_families_token ON refresh_token_families(current_token_hash);

      CREATE TABLE IF NOT EXISTS api_keys (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        key_hash    TEXT NOT NULL UNIQUE,
        key_prefix  TEXT NOT NULL,
        scopes      TEXT NOT NULL DEFAULT '[]',
        expires_at  BIGINT,
        last_used_at BIGINT,
        created_at  BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

      CREATE TABLE IF NOT EXISTS password_history (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash   TEXT NOT NULL,
        created_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider          TEXT NOT NULL,
        provider_user_id  TEXT NOT NULL,
        email             TEXT,
        created_at        BIGINT NOT NULL,
        UNIQUE(provider, provider_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider, provider_user_id);
    `,
    down: `
      DROP TABLE IF EXISTS oauth_accounts;
      DROP TABLE IF EXISTS password_history;
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS refresh_token_families;
      DROP TABLE IF EXISTS verification_tokens;
    `,
  },
];

// biome-ignore lint/suspicious/noExplicitAny: Bun.sql returns generic tagged template type
type PgClient = any;

const ensureMigrationsTable = async (sql: PgClient): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  BIGINT NOT NULL
    )
  `;
};

const getAppliedVersions = async (sql: PgClient): Promise<Set<string>> => {
  const rows = await sql`SELECT version FROM _migrations ORDER BY version`;
  return new Set(rows.map((r: { version: string }) => r.version));
};

export const pgMigrateUp = async (sql: PgClient, logger: Logger): Promise<number> => {
  await ensureMigrationsTable(sql);
  const applied = await getAppliedVersions(sql);
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    await sql.begin(async (tx: PgClient) => {
      // Execute raw SQL statements
      for (const stmt of migration.up.split(";").filter((s: string) => s.trim())) {
        await tx.unsafe(stmt.trim());
      }
      await tx`
        INSERT INTO _migrations (version, name, applied_at)
        VALUES (${migration.version}, ${migration.name}, ${Date.now()})
      `;
    });

    logger.info("Migration applied", {
      version: migration.version,
      name: migration.name,
    });
    count++;
  }

  if (count > 0) {
    logger.info("Postgres migrations complete", { applied: count });
  }

  return count;
};

export const pgMigrateDown = async (sql: PgClient, logger: Logger): Promise<string | null> => {
  await ensureMigrationsTable(sql);
  const applied = await getAppliedVersions(sql);

  // Find the highest applied migration
  const reversed = [...migrations].reverse();
  for (const migration of reversed) {
    if (!applied.has(migration.version)) continue;

    await sql.begin(async (tx: PgClient) => {
      for (const stmt of migration.down.split(";").filter((s: string) => s.trim())) {
        await tx.unsafe(stmt.trim());
      }
      await tx`DELETE FROM _migrations WHERE version = ${migration.version}`;
    });

    logger.info("Migration rolled back", {
      version: migration.version,
      name: migration.name,
    });
    return migration.version;
  }

  return null;
};
