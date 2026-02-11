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
- **41 tests** — unit + integration, all passing

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
│   ├── database/           # In-memory user repository (plug your own)
│   ├── logging/            # Structured JSON logger with batched async writes
│   └── security/           # Argon2id hasher, HMAC-SHA256 JWT service
├── presentation/           # HTTP layer
│   ├── handlers/           # Route handlers (health, auth, user)
│   ├── middleware/          # CORS, rate-limit, auth, validation, security headers
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

### Install & Run

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
| `POST` | `/api/v1/auth/register` | No | Register a new user |
| `POST` | `/api/v1/auth/login` | No | Login, returns JWT pair |
| `POST` | `/api/v1/auth/refresh` | No | Refresh access token |
| `GET` | `/api/v1/users/me` | Bearer | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Bearer | Update current user |
| `DELETE` | `/api/v1/users/me` | Bearer | Delete current user |

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
# Run all tests (41 tests across 6 files)
bun test

# Watch mode
bun test --watch

# Specific test file
bun test tests/unit/result.test.ts
```

Tests cover:
- **Unit**: Result monad, AppError, PasswordHasher, TokenService, UserRepository
- **Integration**: Full HTTP request lifecycle (health, auth flow, error handling, CORS)

## Roadmap

> What we have is a **rock-solid foundation**. What follows turns it into a full production platform.

### v1.1 — Persistence & Auth Hardening

- [ ] **SQLite adapter** via `bun:sqlite` (zero-dep, swap the in-memory repository)
- [ ] **Database migrations** — versioned SQL files with up/down
- [ ] **Logout endpoint** — `POST /api/v1/auth/logout` with token blacklist (in-memory Set → Redis-ready port)
- [ ] **Account lockout** — lock after N failed login attempts
- [ ] **Dockerfile** — multi-stage build, `distroless` base, <20 MB image
- [ ] **docker-compose** — app + SQLite volume
- [ ] **Test coverage** — add `--coverage` flag, enforce 80%+ threshold in CI

### v1.2 — API Maturity

- [ ] **Admin endpoints** — `GET /api/v1/admin/users` (list, search, ban, change role)
- [ ] **Pagination** — cursor-based `?cursor=X&limit=20` on list endpoints
- [ ] **OpenAPI 3.1 spec** — auto-generated from Zod schemas, served at `/docs`
- [ ] **ETag / conditional requests** — `If-None-Match` support for GET endpoints
- [ ] **Request ID tracing** — propagate `X-Request-Id` into child loggers + response
- [ ] **Structured JSON log mode** — `LOG_FORMAT=json` for production log aggregators (Datadog, ELK)
- [ ] **Audit log** — append-only log of who did what (user ID, action, timestamp, IP)

### v1.3 — Observability & Resilience

- [ ] **Prometheus metrics** — `GET /metrics` endpoint (request count, latency histogram, error rate, active connections)
- [ ] **OpenTelemetry traces** — distributed tracing with trace/span IDs
- [ ] **Circuit breaker** — resilience pattern for external service calls (DB, APIs)
- [ ] **Retry with backoff** — configurable retry policy for transient failures
- [ ] **Graceful degradation** — fallback responses when downstream services fail
- [ ] **Alerting hooks** — webhook notifications on fatal errors / health degradation

### v1.4 — Auth Platform

- [ ] **Email verification** — `POST /api/v1/auth/verify-email` with time-limited token
- [ ] **Password reset** — `POST /api/v1/auth/forgot-password` + `POST /api/v1/auth/reset-password`
- [ ] **Refresh token rotation** — one-time-use refresh tokens with reuse detection
- [ ] **MFA / 2FA** — TOTP-based (Google Authenticator compatible)
- [ ] **OAuth2 / SSO** — Google, GitHub provider adapters
- [ ] **API key auth** — `X-API-Key` header for service-to-service calls
- [ ] **Password policy** — history, reuse prevention, expiry

### v1.5 — Real-time & Events

- [ ] **WebSocket support** — Bun-native WebSocket upgrade in `Bun.serve()`
- [ ] **Server-Sent Events (SSE)** — streaming endpoint for real-time updates
- [ ] **Domain events** — `UserRegistered`, `UserDeleted`, `LoginFailed` event emitter
- [ ] **Event bus port** — pluggable adapter (in-memory → Redis Pub/Sub → NATS)
- [ ] **Webhooks** — outbound HTTP notifications on domain events
- [ ] **Background job queue** — async task processing with retry

### v2.0 — Scale & Ecosystem

- [ ] **Postgres adapter** — connection pooling, transactions, query builder
- [ ] **Redis adapter** — caching layer, session store, rate limiter backend, pub/sub
- [ ] **Kubernetes manifests** — Deployment, Service, Ingress, HPA, liveness/readiness probes
- [ ] **Helm chart** — parameterized K8s deployment
- [ ] **CD pipeline** — GitHub Actions deploy to fly.io / Railway / AWS
- [ ] **API versioning** — v2 route modules coexisting with v1, deprecation headers
- [ ] **i18n** — `Accept-Language` header, translated error messages
- [ ] **E2E test suite** — full client simulation with test containers
- [ ] **Load test harness** — automated bombardier runs with regression detection
- [ ] **Postman / Insomnia collection** — pre-built API client for contributors

### Current Status

| Area | Status |
|------|--------|
| Architecture | ✅ Clean hexagonal, DI container, Result monad |
| Performance | ✅ ~30K req/s, batched I/O, SO_REUSEPORT cluster |
| TypeScript | ✅ 22+ strict flags, branded types |
| Security | ✅ Argon2id, JWT, CORS, rate-limit, security headers |
| Testing | ✅ 41 tests (unit + integration) |
| CI/CD | ✅ GitHub Actions (lint → check → test → build) |
| Database | ⚠️ In-memory only |
| Auth | ⚠️ No logout, no email verification, no MFA |
| Observability | ⚠️ Logging only, no metrics/tracing |
| Containerization | ❌ No Dockerfile |
| API Docs | ❌ No OpenAPI spec |
| Caching | ❌ None |
| Events | ❌ None |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE) — use it however you like.
