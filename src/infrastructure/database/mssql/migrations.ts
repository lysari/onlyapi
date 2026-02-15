/**
 * SQL Server migration runner — uses the `mssql` npm package.
 *
 * Mirrors the Postgres migration runner pattern but uses T-SQL DDL.
 * Migrations are idempotent and wrapped in transactions.
 */

import type sql from "mssql";
import type { Logger } from "../../../core/ports/logger.js";

interface MssqlMigration {
  readonly version: string;
  readonly name: string;
  readonly up: string; // T-SQL DDL
  readonly down: string;
}

/**
 * All SQL Server migrations — inlined T-SQL strings.
 * Uses NVARCHAR for text, BIGINT for timestamps (ms), BIT for booleans.
 */
const migrations: readonly MssqlMigration[] = [
  {
    version: "001",
    name: "create_users",
    up: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
      CREATE TABLE users (
        id                    NVARCHAR(36)  NOT NULL PRIMARY KEY,
        email                 NVARCHAR(255) NOT NULL UNIQUE,
        password_hash         NVARCHAR(255) NOT NULL,
        role                  NVARCHAR(20)  NOT NULL DEFAULT 'user',
        email_verified        BIT           NOT NULL DEFAULT 0,
        mfa_secret            NVARCHAR(255) NULL,
        mfa_enabled           BIT           NOT NULL DEFAULT 0,
        password_changed_at   BIGINT        NULL,
        failed_login_attempts INT           NOT NULL DEFAULT 0,
        locked_until          BIGINT        NULL,
        created_at            BIGINT        NOT NULL,
        updated_at            BIGINT        NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_email')
      CREATE UNIQUE INDEX idx_users_email ON users(email);
    `,
    down: `
      DROP INDEX IF EXISTS idx_users_email ON users;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
      DROP TABLE users;
    `,
  },
  {
    version: "002",
    name: "create_token_blacklist",
    up: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'token_blacklist')
      CREATE TABLE token_blacklist (
        token_hash  NVARCHAR(128)  NOT NULL PRIMARY KEY,
        expires_at  BIGINT         NOT NULL,
        created_at  BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_token_blacklist_expires')
      CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_token_blacklist_expires ON token_blacklist;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'token_blacklist')
      DROP TABLE token_blacklist;
    `,
  },
  {
    version: "003",
    name: "create_audit_log",
    up: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log')
      CREATE TABLE audit_log (
        id          NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id     NVARCHAR(36)   NULL,
        action      NVARCHAR(50)   NOT NULL,
        resource    NVARCHAR(100)  NOT NULL,
        resource_id NVARCHAR(36)   NULL,
        detail      NVARCHAR(MAX)  NULL,
        ip          NVARCHAR(45)   NOT NULL,
        timestamp   BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_audit_log_user')
      CREATE INDEX idx_audit_log_user ON audit_log(user_id);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_audit_log_action')
      CREATE INDEX idx_audit_log_action ON audit_log(action);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_audit_log_timestamp')
      CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
    `,
    down: `
      DROP INDEX IF EXISTS idx_audit_log_timestamp ON audit_log;
      DROP INDEX IF EXISTS idx_audit_log_action ON audit_log;
      DROP INDEX IF EXISTS idx_audit_log_user ON audit_log;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log')
      DROP TABLE audit_log;
    `,
  },
  {
    version: "004",
    name: "auth_platform",
    up: `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'verification_tokens')
      CREATE TABLE verification_tokens (
        id          NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id     NVARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        NVARCHAR(30)   NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
        token_hash  NVARCHAR(128)  NOT NULL UNIQUE,
        expires_at  BIGINT         NOT NULL,
        used_at     BIGINT         NULL,
        created_at  BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_verification_tokens_hash')
      CREATE INDEX idx_verification_tokens_hash ON verification_tokens(token_hash);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_verification_tokens_user')
      CREATE INDEX idx_verification_tokens_user ON verification_tokens(user_id, type);

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'refresh_token_families')
      CREATE TABLE refresh_token_families (
        id                  NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id             NVARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_token_hash  NVARCHAR(128)  NOT NULL,
        revoked             BIT            NOT NULL DEFAULT 0,
        created_at          BIGINT         NOT NULL,
        updated_at          BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_refresh_families_user')
      CREATE INDEX idx_refresh_families_user ON refresh_token_families(user_id);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_refresh_families_token')
      CREATE INDEX idx_refresh_families_token ON refresh_token_families(current_token_hash);

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'api_keys')
      CREATE TABLE api_keys (
        id           NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id      NVARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name         NVARCHAR(100)  NOT NULL,
        key_hash     NVARCHAR(128)  NOT NULL UNIQUE,
        key_prefix   NVARCHAR(20)   NOT NULL,
        scopes       NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
        expires_at   BIGINT         NULL,
        last_used_at BIGINT         NULL,
        created_at   BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_api_keys_hash')
      CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_api_keys_user')
      CREATE INDEX idx_api_keys_user ON api_keys(user_id);

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'password_history')
      CREATE TABLE password_history (
        id              NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id         NVARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash   NVARCHAR(255)  NOT NULL,
        created_at      BIGINT         NOT NULL
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_password_history_user')
      CREATE INDEX idx_password_history_user ON password_history(user_id);

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'oauth_accounts')
      CREATE TABLE oauth_accounts (
        id                NVARCHAR(36)   NOT NULL PRIMARY KEY,
        user_id           NVARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider          NVARCHAR(30)   NOT NULL,
        provider_user_id  NVARCHAR(255)  NOT NULL,
        email             NVARCHAR(255)  NULL,
        created_at        BIGINT         NOT NULL,
        UNIQUE(provider, provider_user_id)
      );

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_oauth_accounts_user')
      CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_oauth_accounts_provider')
      CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_user_id);
    `,
    down: `
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'oauth_accounts') DROP TABLE oauth_accounts;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'password_history') DROP TABLE password_history;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'api_keys') DROP TABLE api_keys;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'refresh_token_families') DROP TABLE refresh_token_families;
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'verification_tokens') DROP TABLE verification_tokens;
    `,
  },
];

const ensureMigrationsTable = async (pool: sql.ConnectionPool): Promise<void> => {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '_migrations')
    CREATE TABLE _migrations (
      version     NVARCHAR(10) NOT NULL PRIMARY KEY,
      name        NVARCHAR(100) NOT NULL,
      applied_at  BIGINT NOT NULL
    )
  `);
};

const getAppliedVersions = async (pool: sql.ConnectionPool): Promise<Set<string>> => {
  const result = await pool.request().query("SELECT version FROM _migrations ORDER BY version");
  return new Set(result.recordset.map((r: { version: string }) => r.version));
};

export const mssqlMigrateUp = async (pool: sql.ConnectionPool, logger: Logger): Promise<number> => {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedVersions(pool);
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    const tx = pool.transaction();
    await tx.begin();

    try {
      // T-SQL: execute each batch separated by GO-like blocks (we split on ;; for multi-statement)
      // Since our DDL uses IF NOT EXISTS guards, we run each statement individually
      for (const stmt of migration.up.split(";").filter((s: string) => s.trim())) {
        await tx.request().query(stmt.trim());
      }

      await tx
        .request()
        .input("version", migration.version)
        .input("name", migration.name)
        .input("appliedAt", Date.now())
        .query(
          "INSERT INTO _migrations (version, name, applied_at) VALUES (@version, @name, @appliedAt)",
        );

      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    logger.info("Migration applied", {
      version: migration.version,
      name: migration.name,
    });
    count++;
  }

  if (count > 0) {
    logger.info("SQL Server migrations complete", { applied: count });
  }
  return count;
};

export const mssqlMigrateDown = async (
  pool: sql.ConnectionPool,
  logger: Logger,
): Promise<string | null> => {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedVersions(pool);
  const reversed = [...migrations].reverse();

  for (const migration of reversed) {
    if (!applied.has(migration.version)) continue;

    const tx = pool.transaction();
    await tx.begin();

    try {
      for (const stmt of migration.down.split(";").filter((s: string) => s.trim())) {
        await tx.request().query(stmt.trim());
      }

      await tx
        .request()
        .input("version", migration.version)
        .query("DELETE FROM _migrations WHERE version = @version");

      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    logger.info("Migration rolled back", {
      version: migration.version,
      name: migration.name,
    });
    return migration.version;
  }

  return null;
};
