# Database

onlyApi supports three database backends — switchable via a single environment variable. The core layer defines repository interfaces (ports); the infrastructure layer provides concrete adapters.

---

## Driver Selection

```env
DATABASE_DRIVER=sqlite    # Default — zero-config, file-based
DATABASE_DRIVER=postgres  # Production-grade relational database
```

An **in-memory** adapter is also available for testing (used automatically in test suites).

---

## SQLite (Default)

Uses Bun's native `bun:sqlite` driver — no external dependencies, no C bindings, no npm packages.

### Configuration

```env
DATABASE_DRIVER=sqlite
DATABASE_PATH=data/onlyapi.sqlite
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_DRIVER` | `sqlite` | Set to `sqlite` |
| `DATABASE_PATH` | `data/onlyapi.sqlite` | Path to the database file |

### Performance Settings

The following PRAGMAs are applied at startup:

```sql
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging for concurrent reads
PRAGMA synchronous = NORMAL;         -- Balance between safety and speed
PRAGMA foreign_keys = ON;            -- Enforce referential integrity
PRAGMA busy_timeout = 5000;          -- Wait 5s when database is locked
PRAGMA cache_size = -20000;          -- 20 MB page cache
```

### Migrations

SQLite migrations run automatically on startup. The following tables are created:

| Migration | Tables |
|-----------|--------|
| `001_create_users` | `users` |
| `002_create_token_blacklist` | `token_blacklist` |
| `003_create_audit_log` | `audit_log` |
| `004_auth_platform` | `refresh_token_families`, `verification_tokens`, `api_keys`, `password_history`, `oauth_accounts`, `account_lockout` |

### File Location

The SQLite database file is created at the path specified by `DATABASE_PATH`. The directory is created automatically if it does not exist. In Docker, mount a volume to persist data:

```yaml
volumes:
  - ./data:/app/data
```

---

## PostgreSQL

Uses `Bun.sql` — Bun's native, zero-dependency PostgreSQL driver. No `pg`, no `node-postgres`, no ORM.

### Configuration

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@localhost:5432/onlyapi
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_DRIVER` | — | Set to `postgres` |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string |

### Connection String Format

```
postgres://username:password@hostname:port/database?sslmode=require
```

Examples:

```env
# Local development
DATABASE_URL=postgres://onlyapi:secret@localhost:5432/onlyapi

# Docker Compose
DATABASE_URL=postgres://onlyapi:secret@db:5432/onlyapi

# Cloud (SSL)
DATABASE_URL=postgres://user:pass@db.example.com:5432/onlyapi?sslmode=require
```

### Migrations

PostgreSQL migrations are DDL scripts that run automatically on startup. They create the same schema as SQLite but with PostgreSQL-specific types:

| Type | SQLite | PostgreSQL |
|------|--------|------------|
| Primary key | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` |
| Timestamp | `INTEGER` | `BIGINT` |
| Boolean | `INTEGER` | `BOOLEAN` |
| JSON | `TEXT` | `JSONB` |

### Docker Compose Example

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: onlyapi
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: onlyapi
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    environment:
      DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://onlyapi:secret@db:5432/onlyapi
    depends_on:
      - db
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

---

## Repository Implementations

Both SQLite and PostgreSQL provide the same set of repository adapters:

| Repository | Purpose |
|------------|---------|
| `UserRepository` | User CRUD — `findById`, `findByEmail`, `create`, `update`, `delete`, `list`, `count` |
| `RefreshTokenStore` | Token family management — `createFamily`, `rotate`, `findByTokenHash`, `revokeFamily`, `revokeAllForUser`, `prune` |
| `TokenBlacklist` | Revoked token tracking — `add`, `isBlacklisted`, `prune` |
| `VerificationTokenRepository` | Email verification and password reset tokens — `create`, `verify`, `invalidateAll`, `prune` |
| `ApiKeyRepository` | API key storage — `create`, `verify`, `listByUser`, `revoke`, `touch` |
| `PasswordHistory` | Previous password hashes — `add`, `getRecent`, `prune` |
| `AccountLockout` | Failed login tracking — `recordFailedAttempt`, `resetAttempts`, `isLocked` |
| `AuditLog` | Immutable action log — `append`, `query` |
| `OAuthAccountRepository` | OAuth provider linking — `link`, `findByProvider`, `listByUser`, `unlink` |

### In-Memory Adapter

The in-memory adapter (`in-memory-user.repository.ts`) uses JavaScript `Map` objects and implements the full `UserRepository` interface. It is used in:

- Unit tests
- Integration tests
- Development when no database persistence is needed

---

## Automatic Maintenance

The server runs periodic maintenance tasks:

| Task | Interval | Description |
|------|----------|-------------|
| Token blacklist prune | 10 minutes | Remove expired entries from `token_blacklist` |
| Refresh token prune | 10 minutes | Remove expired token families |
| Verification token prune | 10 minutes | Remove expired verification tokens |

These tasks run on a `setInterval` and are cleared during graceful shutdown.

---

## Schema Reference

### `users` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `email` | `TEXT UNIQUE` | Lowercased, trimmed |
| `password_hash` | `TEXT` | Argon2id hash |
| `role` | `TEXT` | `admin` or `user` |
| `email_verified` | `BOOLEAN` | Whether email is verified |
| `mfa_enabled` | `BOOLEAN` | Whether MFA is active |
| `mfa_secret` | `TEXT NULL` | TOTP secret (Base32) |
| `password_changed_at` | `BIGINT NULL` | Timestamp of last password change |
| `created_at` | `BIGINT` | Creation timestamp (ms) |
| `updated_at` | `BIGINT` | Last update timestamp (ms) |

### `token_blacklist` Table

| Column | Type | Description |
|--------|------|-------------|
| `token_hash` | `TEXT PK` | SHA-256 hash of the token |
| `expires_at` | `BIGINT` | When the token would have expired |

### `audit_log` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `action` | `TEXT` | Action type (e.g., `USER_LOGGED_IN`) |
| `user_id` | `TEXT NULL` | Actor's user ID |
| `target_id` | `TEXT NULL` | Target user ID (for admin actions) |
| `ip` | `TEXT NULL` | Client IP address |
| `metadata` | `JSONB NULL` | Additional context |
| `created_at` | `BIGINT` | Timestamp |

### `refresh_token_families` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | Family UUID |
| `user_id` | `TEXT` | Owner user ID |
| `current_token_hash` | `TEXT` | Hash of the current valid token |
| `revoked` | `BOOLEAN` | Whether the family is revoked |
| `created_at` | `BIGINT` | Timestamp |
| `updated_at` | `BIGINT` | Timestamp |

### `api_keys` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `user_id` | `TEXT` | Owner user ID |
| `name` | `TEXT` | Human-readable name |
| `key_hash` | `TEXT UNIQUE` | SHA-256 hash of the raw key |
| `key_prefix` | `TEXT` | First 8 chars for identification |
| `scopes` | `JSONB` | Array of scope strings |
| `last_used_at` | `BIGINT NULL` | Last usage timestamp |
| `expires_at` | `BIGINT NULL` | Expiration timestamp (null = never) |
| `created_at` | `BIGINT` | Creation timestamp |

### `password_history` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `user_id` | `TEXT` | User ID |
| `password_hash` | `TEXT` | Argon2id hash |
| `created_at` | `BIGINT` | When the password was set |

### `verification_tokens` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `user_id` | `TEXT` | User ID |
| `token_hash` | `TEXT` | SHA-256 hash |
| `type` | `TEXT` | `EMAIL_VERIFICATION` or `PASSWORD_RESET` |
| `expires_at` | `BIGINT` | Expiration timestamp |
| `used` | `BOOLEAN` | Whether the token has been consumed |
| `created_at` | `BIGINT` | Creation timestamp |

### `oauth_accounts` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID v4 |
| `user_id` | `TEXT` | Local user ID |
| `provider` | `TEXT` | `google` or `github` |
| `provider_user_id` | `TEXT` | User ID from the provider |
| `email` | `TEXT` | Email from the provider |
| `created_at` | `BIGINT` | Link timestamp |
