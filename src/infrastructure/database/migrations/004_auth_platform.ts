import type { Database } from "bun:sqlite";

/**
 * Migration 004: Auth Platform
 * - Add email_verified, mfa_secret, mfa_enabled, password_changed_at to users
 * - Create verification_tokens table (email verification + password reset)
 * - Create refresh_token_families table (token rotation with reuse detection)
 * - Create api_keys table (service-to-service auth)
 * - Create password_history table (password reuse prevention)
 * - Create oauth_accounts table (OAuth2/SSO provider linking)
 */
export const up = (db: Database): void => {
  // Extend users table
  db.run("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  db.run("ALTER TABLE users ADD COLUMN mfa_secret TEXT");
  db.run("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0");
  db.run("ALTER TABLE users ADD COLUMN password_changed_at INTEGER");

  // Verification tokens (email verification + password reset)
  db.run(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  INTEGER NOT NULL,
      used_at     INTEGER,
      created_at  INTEGER NOT NULL
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens(token_hash)",
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens(user_id, type)",
  );

  // Refresh token families (rotation with reuse detection)
  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_token_families (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_token_hash  TEXT NOT NULL,
      revoked             INTEGER NOT NULL DEFAULT 0,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_refresh_families_user ON refresh_token_families(user_id)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_refresh_families_token ON refresh_token_families(current_token_hash)",
  );

  // API keys
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL UNIQUE,
      key_prefix  TEXT NOT NULL,
      scopes      TEXT NOT NULL DEFAULT '[]',
      expires_at  INTEGER,
      last_used_at INTEGER,
      created_at  INTEGER NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)");
  db.run("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)");

  // Password history
  db.run(`
    CREATE TABLE IF NOT EXISTS password_history (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      password_hash   TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id)");

  // OAuth accounts
  db.run(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider          TEXT NOT NULL,
      provider_user_id  TEXT NOT NULL,
      email             TEXT,
      created_at        INTEGER NOT NULL,
      UNIQUE(provider, provider_user_id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider, provider_user_id)",
  );
};

export const down = (db: Database): void => {
  db.run("DROP TABLE IF EXISTS oauth_accounts");
  db.run("DROP TABLE IF EXISTS password_history");
  db.run("DROP TABLE IF EXISTS api_keys");
  db.run("DROP TABLE IF EXISTS refresh_token_families");
  db.run("DROP TABLE IF EXISTS verification_tokens");

  // SQLite doesn't support DROP COLUMN before 3.35.0, but bun:sqlite supports it
  db.run("ALTER TABLE users DROP COLUMN password_changed_at");
  db.run("ALTER TABLE users DROP COLUMN mfa_enabled");
  db.run("ALTER TABLE users DROP COLUMN mfa_secret");
  db.run("ALTER TABLE users DROP COLUMN email_verified");
};
