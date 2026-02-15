<div align="center">

# onlyApi

**Production-ready REST API foundation built on [Bun](https://bun.sh)**

Zero unnecessary dependencies. Strictest TypeScript. Clean architecture. Enterprise security.

[![CI](https://github.com/lysari/onlyapi/actions/workflows/ci.yml/badge.svg)](https://github.com/lysari/onlyapi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun_1.3-f472b6)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-351_passing-brightgreen)]()

</div>

---

## Overview

onlyApi is a batteries-included API starter that ships everything you need to go from `git clone` to production — authentication, database, caching, observability, deployment — without pulling in a single framework or ORM. One runtime dependency (`zod`). ~78 KB minified.

```bash
bunx onlyapi init my-api && cd my-api && bun run dev
```

---

## Features

### Performance

- **~30K req/s** single-core on a MacBook; scales linearly via `SO_REUSEPORT` clustering
- O(1) Map-based routing — no regex matching, no radix tree traversal
- Pathname extracted with string slicing — no `new URL()` allocation (~12x faster)
- Pre-serialized static responses — `/health` avoids `JSON.stringify` entirely
- Batched async access logging — one `write()` syscall per 100ms flush window
- Inlined rate limiter on the hot path — zero function-call overhead

### Authentication & Authorization

- **JWT** — HMAC-SHA256 via Web Crypto API; access + refresh token pair
- **Refresh token rotation** — one-time-use tokens with family-based reuse detection
- **MFA / TOTP** — RFC 6238 implementation, Google Authenticator compatible
- **OAuth2 / SSO** — Google and GitHub provider adapters
- **API key auth** — `X-API-Key` header for service-to-service communication
- **Email verification** — SHA-256 hashed, time-limited verification tokens
- **Password reset** — secure token-based flow with non-enumerable responses
- **Password policy** — configurable complexity, history tracking, reuse prevention, expiry
- **Account lockout** — automatic lock after N consecutive failed login attempts
- **Token blacklist** — logout invalidates both access and refresh tokens

### Database

- **SQLite** — `bun:sqlite` with WAL mode, zero-dep, built-in migrations
- **PostgreSQL** — `Bun.sql` with 9 repository implementations and DDL migration runner
- **SQL Server** — `mssql` (tedious TDS) with 9 repository adapters, T-SQL migrations, and stored procedure support
- **In-memory** — testing adapter with full repository interface compliance
- Config-driven adapter selection via `DATABASE_DRIVER=sqlite|postgres|mssql`

### Caching

- **In-memory cache** — Map-based with TTL and automatic prune interval
- **Redis cache** — zero-dep implementation over raw RESP protocol via `Bun.connect()` TCP
- Unified `Cache` port — `get`, `set`, `del`, `has`, `incr`, `delPattern`, `close`

### Real-time

- **WebSocket** — Bun-native upgrade at `/ws` with JSON protocol, JWT auth, pub/sub subscriptions
- **Server-Sent Events** — `GET /api/v1/events/stream` with auth, event filtering, 30s heartbeat
- **Domain events** — 15 typed events (`USER_REGISTERED`, `LOGIN_FAILED`, `MFA_ENABLED`, etc.)
- **Event bus** — in-memory pub/sub with type-specific and wildcard subscriptions
- **Webhooks** — outbound HTTP with HMAC-SHA256 signatures, event-type filtering per subscription
- **Background job queue** — async processing with exponential backoff retry and dead letter queue

### Observability

- **Prometheus metrics** — `GET /metrics` with request count, latency histogram, error rate, active connections
- **OpenTelemetry traces** — distributed tracing with W3C `traceparent` propagation
- **Structured logging** — JSON mode for Datadog / ELK; batched async writes in production
- **Audit log** — append-only record of user actions with IP, timestamp, and user ID
- **Health checks** — shallow `/health` (instant) and deep `/readiness` (service connectivity)
- **Alerting hooks** — webhook notifications on fatal errors and health degradation

### API Design

- **OpenAPI 3.1** — auto-generated spec served at `GET /docs`; Swagger UI at `GET /docs/html`
- **API versioning** — `/api/v1/` and `/api/v2/` coexist; v1 returns `Deprecation` + `Sunset` headers
- **ETag / conditional GET** — `If-None-Match` support with `304 Not Modified` responses
- **Cursor-based pagination** — `?cursor=X&limit=20` on list endpoints
- **Request ID tracing** — `X-Request-Id` propagated through loggers and echoed in responses
- **i18n** — 5 languages (en, es, fr, de, ja), 33 message keys, RFC 7231 `Accept-Language` negotiation

### Security

- **Argon2id** — Bun-native password hashing, no C bindings
- **CORS** — configurable origin allowlist with preflight caching
- **Rate limiting** — per-IP sliding window with `Retry-After` headers
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, and more
- **`Result<T, E>` monad** — no thrown exceptions; errors never leak internal state

### Infrastructure & Deployment

- **Dockerfile** — multi-stage build with distroless base, <20 MB image
- **docker-compose** — app + SQLite volume, ready to run
- **Kubernetes manifests** — Namespace, ConfigMap, Secret, Deployment, Service, Ingress, HPA, PDB, NetworkPolicy
- **Helm chart** — parameterized deployment with 8 templates
- **CI pipeline** — GitHub Actions: lint, type-check, test, build
- **CD pipeline** — multi-arch Docker build (amd64 + arm64), staging deploy with smoke test, production deploy with GitHub Release
- **Postman collection** — all endpoints with auto-token extraction scripts

### Developer Experience

- **CLI scaffolding** — `bunx onlyapi init my-api` creates a full project in seconds
- **CLI upgrade** — `onlyapi upgrade` updates framework internals while preserving custom code
- **Hot reload** — `bun run dev` with `--watch` mode
- **351 tests** — unit, integration, E2E, and load testing across 36 files
- **Biome** — fast linter and formatter, zero-config
- **22+ strict TypeScript flags** — branded types, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`

---

## Architecture

```
src/
├── core/                 # Domain — zero dependencies
│   ├── entities/         # User, UserRole
│   ├── errors/           # AppError, canonical error codes
│   ├── ports/            # Interfaces: repos, services, cache, events
│   └── types/            # Branded types, Result<T,E> monad
├── application/          # Use cases
│   ├── dtos/             # Zod request schemas
│   └── services/         # Auth, User, Health
├── infrastructure/       # Adapters
│   ├── config/           # Zod-validated env config
│   ├── database/         # SQLite, PostgreSQL, SQL Server, in-memory
│   ├── cache/            # In-memory, Redis (raw RESP)
│   ├── logging/          # Structured JSON logger
│   └── security/         # Argon2id, HMAC-SHA256 JWT
├── presentation/         # HTTP
│   ├── handlers/         # Route handlers
│   ├── middleware/        # CORS, auth, rate-limit, versioning
│   ├── i18n/             # Language catalogs
│   ├── routes/           # O(1) Map router
│   └── server.ts         # Bun.serve() hot-path
├── shared/               # DI container, utilities
├── cluster.ts            # SO_REUSEPORT multi-process
└── main.ts               # Bootstrap + graceful shutdown
```

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.1

### Scaffold a Project

```bash
bunx onlyapi init my-api
cd my-api
bun run dev
```

### Or Clone Manually

```bash
git clone https://github.com/lysari/onlyapi.git
cd onlyApi
bun install
cp .env.example .env
bun run dev
```

### Production

```bash
# Single process
bun run start

# Multi-process cluster (1 worker per CPU core)
bun run start:cluster
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Shallow health check |
| `GET` | `/readiness` | — | Deep readiness check |
| `GET` | `/docs` | — | OpenAPI 3.1 JSON |
| `GET` | `/docs/html` | — | Swagger UI |
| `GET` | `/metrics` | — | Prometheus metrics |
| `POST` | `/api/v1/auth/register` | — | Register user |
| `POST` | `/api/v1/auth/login` | — | Login, returns JWT pair |
| `POST` | `/api/v1/auth/refresh` | — | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Bearer | Logout + blacklist tokens |
| `POST` | `/api/v1/auth/verify-email` | — | Verify email token |
| `POST` | `/api/v1/auth/forgot-password` | — | Request password reset |
| `POST` | `/api/v1/auth/reset-password` | — | Reset password with token |
| `POST` | `/api/v1/auth/mfa/setup` | Bearer | Generate TOTP secret |
| `POST` | `/api/v1/auth/mfa/enable` | Bearer | Enable MFA |
| `POST` | `/api/v1/auth/mfa/disable` | Bearer | Disable MFA |
| `POST` | `/api/v1/auth/mfa/verify` | Bearer | Verify TOTP code |
| `GET` | `/api/v1/auth/oauth/:provider` | — | OAuth2 redirect |
| `GET` | `/api/v1/auth/oauth/:provider/callback` | — | OAuth2 callback |
| `GET` | `/api/v1/users/me` | Bearer | Current user profile |
| `PATCH` | `/api/v1/users/me` | Bearer | Update profile |
| `DELETE` | `/api/v1/users/me` | Bearer | Delete account |
| `POST` | `/api/v1/api-keys` | Bearer | Create API key |
| `GET` | `/api/v1/api-keys` | Bearer | List API keys |
| `DELETE` | `/api/v1/api-keys/:id` | Bearer | Revoke API key |
| `POST` | `/api/v1/webhooks` | Admin | Create webhook |
| `GET` | `/api/v1/webhooks` | Admin | List webhooks |
| `DELETE` | `/api/v1/webhooks/:id` | Admin | Remove webhook |
| `GET` | `/api/v1/events/stream` | Bearer | SSE event stream |
| `WS` | `/ws` | JWT | WebSocket connection |

All v1 endpoints are also available under `/api/v2/` with clean version headers.

### Usage

```bash
# Register
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ngP@ss!"}'

# Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ngP@ss!"}'

# Authenticated request
curl -s http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer <token>"
```

---

## Configuration

Environment variables are validated with Zod at startup. Invalid config crashes immediately — not at 3 AM in production.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Environment mode |
| `JWT_SECRET` | — | **Required.** Min 32 characters |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `DATABASE_DRIVER` | `sqlite` | `sqlite`, `postgres`, or `mssql` |
| `DATABASE_URL` | — | PostgreSQL or SQL Server connection string |
| `REDIS_ENABLED` | `false` | Enable Redis cache layer |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `debug` | `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `WORKERS` | CPU count | Cluster worker count |
| `I18N_DEFAULT_LOCALE` | `en` | Default response locale |
| `I18N_SUPPORTED_LOCALES` | `en` | Comma-separated supported locales |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum password length |
| `PASSWORD_HISTORY_COUNT` | `5` | Previous passwords blocked from reuse |
| `OAUTH_GOOGLE_CLIENT_ID` | — | Google OAuth2 client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | — | Google OAuth2 client secret |
| `OAUTH_GITHUB_CLIENT_ID` | — | GitHub OAuth2 client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | — | GitHub OAuth2 client secret |

---

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Development server with hot-reload |
| `bun run start` | Production single-process |
| `bun run start:cluster` | Production multi-process |
| `bun run build` | Bundle and minify to `dist/` |
| `bun run check` | TypeScript type-check |
| `bun test` | Run all 351 tests |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Auto-fix lint issues |

---

## Performance

Benchmarked on MacBook Pro (Intel i7-9750H, 12 threads) with [bombardier](https://github.com/codesenberg/bombardier):

| Mode | Connections | Requests/sec | Avg Latency |
|------|-------------|-------------|-------------|
| Single process | 512 | **29,525** | 17.3ms |
| Cluster (12 workers) | 512 | **32,415** | 15.8ms |

> Localhost-constrained (server + load generator share CPU). Expect 5–10x on dedicated hardware.

---

## Testing

```bash
bun test                           # All 351 tests
bun test --watch                   # Watch mode
bun test tests/unit/               # Unit only
bun test tests/integration/        # Integration only
bun test tests/e2e/                # End-to-end only
bun run tests/load/harness.ts      # Load test with threshold checks
```

| Layer | Coverage |
|-------|----------|
| **Unit** | Result monad, AppError, password hashing, JWT, repositories, TOTP, password policy, cache, i18n, versioning, event bus, webhooks, job queue |
| **Integration** | Full HTTP lifecycle — health, auth flow, email verification, MFA, API keys, password policy, webhooks, SSE, CORS |
| **E2E** | Complete user journey against a live server — register through logout, versioning headers, i18n, ETag/304, security headers |
| **Load** | Automated regression detection — p50/p90/p95/p99 latency, throughput thresholds, error rate checks |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
