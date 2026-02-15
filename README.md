# onlyApi

> Zero-dependency, enterprise-grade REST API built on [Bun](https://bun.sh) — fastest runtime, strictest TypeScript, cleanest architecture.

[![CI](https://github.com/lysari/onlyapi/actions/workflows/ci.yml/badge.svg)](https://github.com/lysari/onlyapi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f472b6)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)

---

## Vision

> Become the gold-standard starting point for every new server-side API — proving that maximum performance, maximum safety, and maximum simplicity are not trade-offs but consequences of the same discipline.

## Mission

> Ship a production-ready, zero-bloat API foundation on the Bun runtime that any developer can clone and go live in minutes — with the strictest type safety, the cleanest architecture, and the fastest request handling — all without a single unnecessary dependency.

## Core Principles

| Principle | What it means |
|---|---|
| **Fastest** | Raw throughput rivals frameworks with C/Rust cores. Every microsecond is earned — no URL parsing, pre-serialized responses, batched I/O, SO_REUSEPORT clustering. |
| **Cleanest** | Clean/Hexagonal Architecture. Every layer has one job. Swap any adapter (DB, auth, logger) without touching business logic. |
| **Smallest** | One runtime dep (`zod`). ~78 KB minified bundle. No framework, no ORM, no decorator magic — just TypeScript functions. |
| **Securest** | Argon2id passwords, HMAC-SHA256 JWT via Web Crypto, CORS, rate-limiting, security headers, `Result<T,E>` (no thrown exceptions leaking internals). |
| **Strictest** | 22+ TypeScript compiler flags, branded types, exhaustive error codes — bugs are caught at compile time, not in production. |

> *The fastest way to ship a secure, maintainable API — with nothing you don't need and everything you do.*

---

## Highlights

- **~30K req/s single-core** on a MacBook — scales linearly with `SO_REUSEPORT` clustering
- **Zero runtime dependencies** besides `zod` for schema validation
- **Clean Architecture** — Domain → Application → Infrastructure → Presentation
- **Strictest TypeScript** — 22+ compiler flags, branded types, `Result<T,E>` monad (no `throw`)
- **Security-first** — Argon2id (Bun-native), HMAC-SHA256 JWT (Web Crypto API), CORS, rate-limiting, security headers
- **351 tests** — unit + integration + E2E, all passing

## Architecture

```
src/
├── core/                   # Domain layer — zero dependencies
│   ├── entities/           # User entity, UserRole enum
│   ├── errors/             # AppError with canonical error codes
│   ├── ports/              # Interfaces: Logger, UserRepository, TokenService, PasswordHasher
│   └── types/              # Branded types (UserId, RequestId), Result<T,E> monad
├── application/            # Use cases
│   ├── dtos/               # Zod schemas for request validation
│   └── services/           # AuthService, UserService, HealthService
├── infrastructure/         # Adapters (swap without touching business logic)
│   ├── config/             # Zod-validated environment config — fail-fast on boot
│   ├── database/           # SQLite + PostgreSQL + in-memory adapters, migrations
│   ├── cache/              # In-memory + Redis cache adapters (zero-dep RESP protocol)
│   ├── logging/            # Structured JSON logger with batched async writes
│   └── security/           # Argon2id hasher, HMAC-SHA256 JWT service
├── presentation/           # HTTP layer
│   ├── handlers/           # Route handlers (health, auth, user)
│   ├── middleware/          # CORS, rate-limit, auth, validation, security headers, versioning
│   ├── i18n/               # 5 language catalogs, Accept-Language parsing
│   ├── routes/             # O(1) Map-based router
│   ├── context.ts          # Typed RequestContext
│   └── server.ts           # Bun.serve() with inlined hot-path optimizations
├── shared/                 # DI container, utilities
├── cluster.ts              # Multi-process SO_REUSEPORT clustering
└── main.ts                 # Bootstrap & graceful shutdown
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.1

### Create a New Project (CLI)

The fastest way to get started — scaffold a full project with one command:

```bash
# Using bunx (recommended)
bunx onlyapi init my-api

# Or install globally
bun install -g only-api
onlyapi init my-api

# Initialize in the current directory
onlyapi init .
```

The `init` command will:
1. Clone the latest template from GitHub
2. Install dependencies via `bun install`
3. Generate a secure random `JWT_SECRET`
4. Create `.env` from `.env.example`
5. Initialize a fresh git repository with an initial commit

### Upgrade an Existing Project

Keep your project's core infrastructure up to date:

```bash
# In your project directory
onlyapi upgrade

# Preview changes without applying
onlyapi upgrade --dry-run

# Force re-apply even if on latest version
onlyapi upgrade --force
```

The upgrade command safely updates framework internals (middleware, security, utilities, config) while preserving your custom code (handlers, services, entities, routes).

### CLI Commands Reference

| Command | Description |
|---------|-------------|
| `onlyapi init <name>` | Create a new project (aliases: `create`, `new`) |
| `onlyapi upgrade` | Upgrade current project (alias: `update`) |
| `onlyapi version` | Show CLI version |
| `onlyapi help` | Show help with all options |

### Install & Run (Manual)

```bash
# Clone
git clone https://github.com/lysari/onlyapi.git
cd onlyApi

# Install dependencies
bun install

# Copy environment config
cp .env.example .env

# Start development server (hot-reload)
bun run dev

# Run tests
bun test

# Type-check
bun run check
```

### Production

```bash
# Single process
bun run start

# Multi-process cluster (1 worker per CPU core)
bun run start:cluster

# Custom worker count
WORKERS=8 bun run start:cluster
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Shallow health check (instant) |
| `GET` | `/readiness` | No | Deep readiness check |
| `GET` | `/docs` | No | OpenAPI 3.1 JSON spec |
| `GET` | `/metrics` | No | Prometheus metrics |
| `POST` | `/api/v1/auth/register` | No | Register a new user |
| `POST` | `/api/v1/auth/login` | No | Login, returns JWT pair |
| `POST` | `/api/v1/auth/refresh` | No | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Bearer | Logout & blacklist tokens |
| `GET` | `/api/v1/users/me` | Bearer | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Bearer | Update current user |
| `DELETE` | `/api/v1/users/me` | Bearer | Delete current user |
| `POST` | `/api/v1/auth/verify-email` | No | Verify email with token |
| `POST` | `/api/v1/auth/forgot-password` | No | Request password reset email |
| `POST` | `/api/v1/auth/reset-password` | No | Reset password with token |
| `POST` | `/api/v1/auth/mfa/setup` | Bearer | Generate TOTP secret + QR URI |
| `POST` | `/api/v1/auth/mfa/enable` | Bearer | Enable MFA with TOTP code |
| `POST` | `/api/v1/auth/mfa/disable` | Bearer | Disable MFA with TOTP code |
| `POST` | `/api/v1/auth/mfa/verify` | Bearer | Verify TOTP code |
| `GET` | `/api/v1/auth/oauth/:provider` | No | OAuth2 redirect (Google, GitHub) |
| `GET` | `/api/v1/auth/oauth/:provider/callback` | No | OAuth2 callback |
| `POST` | `/api/v1/api-keys` | Bearer | Create API key |
| `GET` | `/api/v1/api-keys` | Bearer | List API keys |
| `DELETE` | `/api/v1/api-keys/:id` | Bearer | Revoke API key |
| `POST` | `/api/v1/webhooks` | Admin | Create webhook subscription |
| `GET` | `/api/v1/webhooks` | Admin | List webhook subscriptions |
| `DELETE` | `/api/v1/webhooks/:id` | Admin | Remove webhook subscription |
| `GET` | `/api/v1/events/stream` | Bearer | SSE real-time event stream |
| `WS` | `/ws` | JWT | WebSocket real-time connection |
| | `/api/v2/...` | — | All v1 endpoints available on v2 (clean version headers) |

### Example

```bash
# Register
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ngP@ss!"}'

# Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ngP@ss!"}'

# Get profile (replace TOKEN)
curl -s http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer TOKEN"
```

## Configuration

All configuration is loaded via environment variables and validated with Zod at startup. See [.env.example](.env.example) for all options.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `JWT_SECRET` | — | **Required.** Min 32 characters |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `debug` | `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `WORKERS` | CPU count | Cluster worker count |
| `PASSWORD_MIN_LENGTH` | `8` | Min password length |
| `PASSWORD_REQUIRE_UPPERCASE` | `true` | Require uppercase letter |
| `PASSWORD_REQUIRE_LOWERCASE` | `true` | Require lowercase letter |
| `PASSWORD_REQUIRE_DIGIT` | `true` | Require digit |
| `PASSWORD_REQUIRE_SPECIAL` | `true` | Require special character |
| `PASSWORD_HISTORY_COUNT` | `5` | Previous passwords to block reuse |
| `PASSWORD_MAX_AGE_DAYS` | `0` | Password expiry (0 = never) |
| `DATABASE_DRIVER` | `sqlite` | Database adapter: `sqlite` \| `postgres` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_ENABLED` | `false` | Enable Redis cache |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `REDIS_DB` | `0` | Redis database number |
| `I18N_DEFAULT_LOCALE` | `en` | Default response locale |
| `I18N_SUPPORTED_LOCALES` | `en` | Comma-separated supported locales |
| `OAUTH_GOOGLE_CLIENT_ID` | — | Google OAuth2 client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | — | Google OAuth2 client secret |
| `OAUTH_GITHUB_CLIENT_ID` | — | GitHub OAuth2 client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | — | GitHub OAuth2 client secret |

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun --watch src/main.ts` | Development with hot-reload |
| `start` | `bun src/main.ts` | Production single-process |
| `start:cluster` | `bun src/cluster.ts` | Production multi-process |
| `build` | `bun build ...` | Bundle & minify to `dist/` |
| `check` | `tsc --noEmit` | Type-check (no emit) |
| `test` | `bun test` | Run all tests |
| `test:watch` | `bun test --watch` | Tests in watch mode |
| `lint` | `biome check src/` | Lint with Biome |
| `lint:fix` | `biome check --write src/` | Auto-fix lint issues |
| `cli` | `bun src/cli/index.ts` | Run CLI tool |
| `create` | `bun src/cli/index.ts init` | Create a new project |
| `upgrade:project` | `bun src/cli/index.ts upgrade` | Upgrade current project |

## Performance

Benchmarked on MacBook Pro (Intel i7-9750H, 12 threads) with [bombardier](https://github.com/codesenberg/bombardier):

| Mode | Connections | Requests/sec | Avg Latency |
|------|-------------|-------------|-------------|
| Single process | 512 | **29,525** | 17.3ms |
| Cluster (12 workers) | 512 | **32,415** | 15.8ms |

> These numbers are localhost-constrained (server + load generator share CPU). On dedicated hardware with a separate load generator, expect 5–10x higher throughput.

### Why it's fast

- **No `new URL()` parsing** — pathname extracted with string slicing (~12x faster)
- **O(1) Map-based routing** — no regex, no radix tree traversal
- **Batched async logging** — log entries buffered and flushed every 100ms in a single `write()` syscall
- **Pre-serialized static responses** — `/health` returns a pre-built string body
- **Inlined rate limiter** — zero function-call overhead on the hot path
- **`SO_REUSEPORT` clustering** — kernel-level load balancing across worker processes

## Design Principles

1. **No `throw` for control flow** — all errors flow through `Result<T, E>` monads
2. **Branded types** — `UserId`, `RequestId`, `Timestamp` prevent type confusion at compile time
3. **Ports & adapters** — swap database, logger, or auth without touching business logic
4. **Fail-fast config** — invalid environment variables crash at boot, not at midnight in production
5. **Zero reflection** — DI container uses symbol tokens, no decorators or `reflect-metadata`

## Testing

```bash
# Run all tests (351 tests across 36 files)
bun test

# Watch mode
bun test --watch

# Specific test file
bun test tests/unit/result.test.ts
```

Tests cover:
- **Unit**: Result monad, AppError, PasswordHasher, TokenService, UserRepository, TOTP, password policy, API keys, refresh tokens, verification tokens, OAuth accounts, password history, migrations, account lockout, event bus, event factory, webhook registry, job queue, cache (in-memory), i18n, API versioning
- **Integration**: Full HTTP request lifecycle (health, auth flow, email verification, MFA, API keys, password policy, webhooks, SSE, error handling, CORS)
- **E2E**: Complete user journey, API versioning headers, i18n negotiation, ETag/304, security headers, OpenAPI, Prometheus metrics
- **Load**: Automated performance regression detection with p50/p90/p95/p99 latency checks

## Roadmap

> What we have is a **rock-solid foundation**. What follows turns it into a full production platform.

### v1.1 — Persistence & Auth Hardening

- [x] **SQLite adapter** via `bun:sqlite` (zero-dep, swap the in-memory repository)
- [x] **Database migrations** — versioned SQL files with up/down
- [x] **Logout endpoint** — `POST /api/v1/auth/logout` with token blacklist (in-memory Set → Redis-ready port)
- [x] **Account lockout** — lock after N failed login attempts
- [x] **Dockerfile** — multi-stage build, `distroless` base, <20 MB image
- [x] **docker-compose** — app + SQLite volume
- [x] **Test coverage** — add `--coverage` flag, enforce 80%+ threshold in CI

### v1.2 — API Maturity

- [x] **Admin endpoints** — `GET /api/v1/admin/users` (list, search, ban, change role)
- [x] **Pagination** — cursor-based `?cursor=X&limit=20` on list endpoints
- [x] **OpenAPI 3.1 spec** — auto-generated from Zod schemas, served at `/docs`
- [x] **ETag / conditional requests** — `If-None-Match` support for GET endpoints
- [x] **Request ID tracing** — propagate `X-Request-Id` into child loggers + response
- [x] **Structured JSON log mode** — `LOG_FORMAT=json` for production log aggregators (Datadog, ELK)
- [x] **Audit log** — append-only log of who did what (user ID, action, timestamp, IP)

### v1.3 — Observability & Resilience

- [x] **Prometheus metrics** — `GET /metrics` endpoint (request count, latency histogram, error rate, active connections)
- [x] **OpenTelemetry traces** — distributed tracing with trace/span IDs
- [x] **Circuit breaker** — resilience pattern for external service calls (DB, APIs)
- [x] **Retry with backoff** — configurable retry policy for transient failures
- [x] **Graceful degradation** — fallback responses when downstream services fail
- [x] **Alerting hooks** — webhook notifications on fatal errors / health degradation

### v1.4 — Auth Platform

- [x] **Email verification** — `POST /api/v1/auth/verify-email` with time-limited token
- [x] **Password reset** — `POST /api/v1/auth/forgot-password` + `POST /api/v1/auth/reset-password`
- [x] **Refresh token rotation** — one-time-use refresh tokens with reuse detection
- [x] **MFA / 2FA** — TOTP-based (Google Authenticator compatible)
- [x] **OAuth2 / SSO** — Google, GitHub provider adapters
- [x] **API key auth** — `X-API-Key` header for service-to-service calls
- [x] **Password policy** — history, reuse prevention, expiry

### v1.5 — Real-time & Events

- [x] **WebSocket support** — Bun-native WebSocket upgrade in `Bun.serve()`
- [x] **Server-Sent Events (SSE)** — streaming endpoint for real-time updates
- [x] **Domain events** — `UserRegistered`, `UserDeleted`, `LoginFailed` event emitter
- [x] **Event bus port** — pluggable adapter (in-memory → Redis Pub/Sub → NATS)
- [x] **Webhooks** — outbound HTTP notifications on domain events
- [x] **Background job queue** — async task processing with retry

### v2.0 — Scale & Ecosystem

- [x] **Postgres adapter** — zero-dep via `Bun.sql`, 9 repository implementations, DDL migration runner
- [x] **Redis adapter** — zero-dep RESP protocol over `Bun.connect()` TCP, Cache port with TTL
- [x] **Kubernetes manifests** — Deployment, Service, Ingress, HPA, PDB, NetworkPolicy
- [x] **Helm chart** — parameterized K8s deployment with 8 templates
- [x] **CD pipeline** — GitHub Actions deploy: multi-arch Docker build, staging → production
- [x] **API versioning** — v2 route modules coexisting with v1, deprecation headers
- [x] **i18n** — `Accept-Language` header, 5 languages, 33 translated message keys
- [x] **E2E test suite** — 28 tests, full client simulation with real server
- [x] **Load test harness** — automated performance regression detection with threshold checks
- [x] **Postman collection** — pre-built API client with auto-token extraction

### Current Status

| Area | Status |
|------|--------|
| Architecture | ✅ Clean hexagonal, DI container, Result monad |
| Performance | ✅ ~30K req/s, batched I/O, SO_REUSEPORT cluster |
| TypeScript | ✅ 22+ strict flags, branded types |
| Security | ✅ Argon2id, JWT, CORS, rate-limit, security headers, account lockout |
| Testing | ✅ 351 tests (unit + integration + E2E) |
| CI/CD | ✅ GitHub Actions CI + CD (staging → production) |
| Database | ✅ SQLite via bun:sqlite + PostgreSQL via Bun.sql |
| Caching | ✅ In-memory + Redis (zero-dep RESP protocol) |
| Auth | ✅ Register, login, refresh, logout, email verification, password reset, MFA/TOTP, OAuth2, API keys, password policy |
| Containerization | ✅ Dockerfile (distroless), docker-compose, Kubernetes, Helm |
| Observability | ✅ Structured logs, Prometheus metrics, OpenTelemetry traces, alerting hooks |
| API Docs | ✅ OpenAPI 3.1 spec + Postman collection |
| i18n | ✅ 5 languages, Accept-Language negotiation |
| Events | ✅ Domain events, event bus, WebSocket, SSE, webhooks, job queue |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE) — use it however you like.
