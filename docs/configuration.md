# Configuration

All configuration is loaded from environment variables at startup and validated with [Zod](https://zod.dev). If any required variable is missing or invalid, the server crashes immediately with a clear error message — not at 3 AM in production.

---

## Setting Variables

Create a `.env` file in the project root:

```env
JWT_SECRET=my-super-secret-key-at-least-32-chars
PORT=3000
NODE_ENV=development
```

Or pass them directly:

```bash
JWT_SECRET=my-secret PORT=8080 bun run dev
```

---

## Variable Reference

### General

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `string` | `development` | `development`, `production`, or `test` |
| `PORT` | `number` | `3000` | Port the server listens on |
| `HOST` | `string` | `0.0.0.0` | Bind address |
| `WORKERS` | `number` | CPU count | Number of cluster workers (only used with `start:cluster`) |

### JWT / Authentication

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JWT_SECRET` | `string` | — | **Required.** HMAC-SHA256 signing key. Minimum 32 characters |
| `JWT_EXPIRES_IN` | `string` | `15m` | Access token TTL. Supports: `15m`, `1h`, `7d` |
| `JWT_REFRESH_EXPIRES_IN` | `string` | `7d` | Refresh token TTL |

> **Security note**: In production, use a cryptographically random secret of at least 64 characters. Generate one with: `openssl rand -base64 64`

### Database

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DATABASE_DRIVER` | `string` | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_PATH` | `string` | `data/onlyapi.sqlite` | Path to SQLite database file (only when `DATABASE_DRIVER=sqlite`) |
| `DATABASE_URL` | `string` | — | PostgreSQL connection string (only when `DATABASE_DRIVER=postgres`) |

**SQLite connection** (default):

```env
DATABASE_DRIVER=sqlite
DATABASE_PATH=data/onlyapi.sqlite
```

**PostgreSQL connection**:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@localhost:5432/onlyapi
```

### Redis / Cache

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_ENABLED` | `boolean` | `false` | Enable the Redis cache layer |
| `REDIS_HOST` | `string` | `127.0.0.1` | Redis server hostname |
| `REDIS_PORT` | `number` | `6379` | Redis server port |
| `REDIS_PASSWORD` | `string` | — | Redis AUTH password (optional) |
| `REDIS_DB` | `number` | `0` | Redis database index |

When `REDIS_ENABLED=false` (default), an in-memory Map-based cache with TTL is used instead. This is suitable for single-process deployments.

### CORS

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CORS_ORIGINS` | `string` | `*` | Comma-separated list of allowed origins |

Examples:

```env
# Allow all origins (development)
CORS_ORIGINS=*

# Allow specific origins (production)
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

### Rate Limiting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `number` | `60000` | Rate limit window duration in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `number` | `100` | Maximum requests per IP per window |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1708099260
```

When exceeded, the server returns `429 Too Many Requests` with a `Retry-After` header.

### Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | `string` | `info` | Minimum log level: `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_FORMAT` | `string` | `pretty` | `pretty` (ANSI-colored, human-readable) or `json` (structured for log aggregators) |

**Pretty format** (development):

```
12:34:56 INFO  Server listening on http://0.0.0.0:3000
```

**JSON format** (production):

```json
{"level":"info","timestamp":"2026-02-16T12:34:56.789Z","msg":"Server listening on http://0.0.0.0:3000","pid":1234}
```

> In production mode, logs are batched and flushed every 100ms to minimise syscall overhead.

### Internationalisation (i18n)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `I18N_DEFAULT_LOCALE` | `string` | `en` | Fallback locale when no `Accept-Language` matches |
| `I18N_SUPPORTED_LOCALES` | `string` | `en` | Comma-separated supported locales |

Available locales: `en`, `es`, `fr`, `de`, `ja`

```env
I18N_DEFAULT_LOCALE=en
I18N_SUPPORTED_LOCALES=en,es,fr,de,ja
```

### Account Lockout

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOCKOUT_MAX_ATTEMPTS` | `number` | `5` | Failed login attempts before locking |
| `LOCKOUT_DURATION_MS` | `number` | `900000` | Lock duration in milliseconds (default: 15 minutes) |

### Password Policy

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PASSWORD_MIN_LENGTH` | `number` | `8` | Minimum password length |
| `PASSWORD_REQUIRE_UPPERCASE` | `boolean` | `true` | Require at least one uppercase letter |
| `PASSWORD_REQUIRE_LOWERCASE` | `boolean` | `true` | Require at least one lowercase letter |
| `PASSWORD_REQUIRE_DIGIT` | `boolean` | `true` | Require at least one digit |
| `PASSWORD_REQUIRE_SPECIAL` | `boolean` | `false` | Require at least one special character |
| `PASSWORD_HISTORY_COUNT` | `number` | `5` | Number of previous passwords blocked from reuse |
| `PASSWORD_MAX_AGE_DAYS` | `number` | `0` | Password expiry in days. `0` = no expiry |

### OAuth2 Providers

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OAUTH_GOOGLE_CLIENT_ID` | `string` | — | Google OAuth2 client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | `string` | — | Google OAuth2 client secret |
| `OAUTH_GITHUB_CLIENT_ID` | `string` | — | GitHub OAuth2 client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | `string` | — | GitHub OAuth2 client secret |

OAuth providers are only enabled if both client ID and secret are provided. See [Authentication](authentication.md#oauth2) for the full flow.

### Circuit Breaker

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CB_FAILURE_THRESHOLD` | `number` | `5` | Consecutive failures to open the circuit |
| `CB_RESET_TIMEOUT_MS` | `number` | `30000` | Time before retrying (OPEN → HALF_OPEN) |
| `CB_HALF_OPEN_SUCCESS_THRESHOLD` | `number` | `2` | Successes required to close (HALF_OPEN → CLOSED) |

### Alerting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALERT_WEBHOOK_URL` | `string` | — | Webhook URL for alert notifications |
| `ALERT_TIMEOUT_MS` | `number` | `5000` | HTTP timeout for alert delivery |

---

## Validation Rules

The configuration schema enforces the following at startup:

- `JWT_SECRET` must be at least 32 characters
- `PORT` must be a positive integer
- `LOG_LEVEL` must be one of: `debug`, `info`, `warn`, `error`, `fatal`
- `DATABASE_DRIVER` must be `sqlite` or `postgres`
- `DATABASE_URL` is required when `DATABASE_DRIVER=postgres`
- Boolean values accept `true`, `false`, `1`, `0`
- Duration strings must match format: `\d+[smhd]` (seconds, minutes, hours, days)

If any validation fails, the process exits with code 1 and a descriptive error message:

```
CONFIG ERROR: JWT_SECRET must be at least 32 characters
```

---

## Example `.env` File

```env
# ─── General ──────────────────────────────────────────
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
WORKERS=4

# ─── Authentication ──────────────────────────────────
JWT_SECRET=change-me-to-a-64-character-random-secret-in-production-please
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Database ─────────────────────────────────────────
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://onlyapi:secret@db:5432/onlyapi

# ─── Cache ────────────────────────────────────────────
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis-secret

# ─── CORS ─────────────────────────────────────────────
CORS_ORIGINS=https://app.example.com

# ─── Rate Limiting ────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ─── Logging ──────────────────────────────────────────
LOG_LEVEL=info
LOG_FORMAT=json

# ─── i18n ─────────────────────────────────────────────
I18N_DEFAULT_LOCALE=en
I18N_SUPPORTED_LOCALES=en,es,fr,de,ja

# ─── Password Policy ─────────────────────────────────
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_HISTORY_COUNT=10
PASSWORD_MAX_AGE_DAYS=90

# ─── Account Security ────────────────────────────────
LOCKOUT_MAX_ATTEMPTS=3
LOCKOUT_DURATION_MS=1800000

# ─── OAuth (optional) ────────────────────────────────
# OAUTH_GOOGLE_CLIENT_ID=
# OAUTH_GOOGLE_CLIENT_SECRET=
# OAUTH_GITHUB_CLIENT_ID=
# OAUTH_GITHUB_CLIENT_SECRET=

# ─── Observability ────────────────────────────────────
# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
# ALERT_TIMEOUT_MS=5000
```
