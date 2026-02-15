# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-15

### Added

- **SQLite persistence** via `bun:sqlite` — zero external dependencies, WAL mode, prepared statements
- **Database migrations** — versioned TypeScript migrations with up/down, tracked in `_migrations` table
- **Logout endpoint** — `POST /api/v1/auth/logout` with token blacklist (in-memory + SQLite adapters)
- **Token blacklist** — SHA-256 hashed tokens, auto-pruning expired entries, Redis-ready port
- **Account lockout** — configurable max attempts + lockout duration, resets on successful login
- **Dockerfile** — multi-stage build with `distroless` base, health check, non-root user
- **docker-compose.yml** — app + SQLite volume, all env vars configurable
- **Test coverage** — `bun test --coverage` script, 67 tests (up from 41)
- `AccountLockout` port + in-memory and SQLite adapters
- `TokenBlacklist` port + in-memory and SQLite adapters
- `SqliteUserRepository` adapter with prepared statements
- New unit tests: SQLite user repository, migrations, token blacklist, account lockout
- New integration tests: logout flow, blacklisted token rejection, account lockout
- `DATABASE_PATH`, `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_DURATION_MS` config options

### Changed

- `AuthService` now requires `TokenBlacklist` and `AccountLockout` dependencies
- `main.ts` bootstrap is now async, initializes SQLite + runs migrations at boot
- Auth handler receives `TokenService` for logout authentication
- Version bumped to 1.1.0 in package.json and startup banner
- Refresh token rotation now blacklists the old refresh token
- Login flow checks account lockout before credential verification

## [1.0.0] - 2026-02-11

### Added

- Clean Architecture project structure (core / application / infrastructure / presentation)
- Bun.serve() HTTP server with inlined hot-path optimizations
- O(1) Map-based router — no regex, no radix tree
- `Result<T, E>` monad for error handling (no throw-based control flow)
- Branded types: `UserId`, `RequestId`, `Timestamp`
- Auth endpoints: register, login, refresh
- User endpoints: get profile, update, delete
- Health endpoints: shallow (`/health`) and deep (`/readiness`)
- Argon2id password hashing via Bun.password (native)
- HMAC-SHA256 JWT via Web Crypto API (zero external deps)
- Zod-validated environment config with fail-fast on boot
- Structured JSON logger with batched async writes
- Per-IP sliding-window rate limiter (inlined on hot path)
- Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- CORS middleware with configurable origin allowlist
- Request validation middleware using Zod schemas
- Bearer token auth middleware
- Multi-process clustering with SO_REUSEPORT (`src/cluster.ts`)
- DI container with symbol tokens (no decorators, no reflect-metadata)
- 41 tests (unit + integration) — all passing
- Biome linting with strict rules (no `any`, no `!`, cognitive complexity cap)
- TypeScript strict mode with 22+ compiler flags
- Benchmarking setup with bombardier
