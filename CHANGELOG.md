# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-16

### Added

- **PostgreSQL adapter** — zero-dep Postgres support via `Bun.sql`; 9 repository implementations (user, token blacklist, account lockout, audit log, verification tokens, refresh token store, API keys, password history, OAuth accounts); automatic DDL migration runner (`pgMigrateUp` / `pgMigrateDown`); config-driven adapter selection (`DATABASE_DRIVER=sqlite|postgres`)
- **Redis cache adapter** — zero-dep Redis client over raw RESP protocol via `Bun.connect()` TCP; `Cache` port with `get`, `set`, `del`, `has`, `incr`, `delPattern`, `close` operations; in-memory fallback cache with TTL and auto-prune; config-driven selection (`REDIS_ENABLED=true|false`)
- **API versioning** — URL-based version negotiation (`/api/v1/...` and `/api/v2/...`); v2 paths normalized to v1 for shared handler lookup; v1 responses include `Deprecation: true`, `Sunset`, and `Link` headers; v2 responses include clean `API-Version: v2` header; `Accept-Version` header support
- **Internationalization (i18n)** — 5 language catalogs (en, es, fr, de, ja) with 33 message keys; RFC 7231 `Accept-Language` quality-value parsing; `Content-Language` response header; `resolveLocale`, `t()` translator, `createI18nContext` helpers; config via `I18N_DEFAULT_LOCALE` and `I18N_SUPPORTED_LOCALES`
- **Kubernetes manifests** — production-ready K8s resources: Namespace, ConfigMap, Secret, Deployment (2 replicas, rolling update, liveness/readiness/startup probes, resource limits), Service (ClusterIP), Ingress (nginx, TLS, cert-manager), HPA (CPU 70% / memory 80%, min 2 max 10), PodDisruptionBudget, NetworkPolicy (DNS, Postgres, Redis egress)
- **Helm chart** — full `helm/onlyapi/` chart with Chart.yaml (appVersion 2.0.0), values.yaml, and 8 templates (deployment, service, configmap, secret, ingress, HPA, serviceaccount, PDB); configurable replicas, probes, autoscaling, and secrets
- **CD pipeline** — `.github/workflows/deploy.yml` continuous deployment: Docker Buildx multi-arch builds (amd64 + arm64), push to GHCR, staging deploy with Helm + smoke test, production deploy with Helm + GitHub Release; triggered by `v*` tags or manual dispatch
- **E2E test suite** — 28 end-to-end tests in `tests/e2e/journey.test.ts` spawning a real server with isolated database; complete user journey (register → login → refresh → update → logout); API versioning headers; i18n Content-Language; security headers; ETag/304 conditional GET; CORS preflight; OpenAPI + Metrics
- **Load test harness** — `tests/load/harness.ts` automated performance regression detection; CLI-driven (--url, --duration, --concurrency, --max-p99, --min-rps); concurrent worker pool; latency percentile computation (p50/p90/p95/p99); 4 scenarios (health, register, login, metrics); threshold pass/fail
- **Postman collection** — `postman/onlyapi-v2.postman_collection.json` with all endpoints (health, auth, users, API keys, admin, webhooks, SSE, docs, metrics, v2 endpoints); auto-extraction scripts for tokens; variables for baseUrl, credentials, token management

### Changed

- Config schema extended with `database.driver` (sqlite | postgres), `redis.*` (enabled, host, port, password, db), `i18n.*` (defaultLocale, supportedLocales)
- `main.ts` bootstrap conditionally selects SQLite or Postgres adapters and in-memory or Redis cache based on config
- DI container expanded with `Cache` token
- Server context includes `apiVersion` and `i18n` fields; responses include `Content-Language` and version headers
- Test count: 282 → 351 (267 unit + 56 integration + 28 E2E) across 36 files
- Version bumped to 2.0.0

---

## [1.5.0] - 2026-02-16

### Added

- **WebSocket support** — Bun-native WebSocket upgrade at `/ws` with JSON protocol; authentication via JWT, pub/sub event subscriptions, broadcast domain events to connected clients; `WebSocketManager` with connection tracking, auth state, per-client event filtering
- **Server-Sent Events (SSE)** — `GET /api/v1/events/stream` streaming endpoint for real-time updates; auth via `?token=` query param or `Authorization` header; event type filtering via `?events=` param; 30s heartbeat keep-alive; `X-Accel-Buffering: no` for Nginx compatibility
- **Domain events** — 15 typed event types (`USER_REGISTERED`, `USER_DELETED`, `USER_UPDATED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `EMAIL_VERIFIED`, `MFA_ENABLED`, `MFA_DISABLED`, `API_KEY_CREATED`, `API_KEY_REVOKED`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`); `DomainEvent<T>` type with id, type, timestamp, optional userId/payload/ip; `DomainEventFactory` for event creation
- **Event bus** — in-memory pub/sub with fire-and-forget semantics; type-specific and wildcard (`subscribeAll`) subscriptions; error isolation (throwing handlers don't crash publisher); `EventBus` port ready to swap for Redis Pub/Sub or NATS
- **Webhooks** — admin-only CRUD API (`POST /api/v1/webhooks`, `GET /api/v1/webhooks`, `DELETE /api/v1/webhooks/:id`); HMAC-SHA256 signed delivery with `X-Webhook-Signature` header; event-type filtering per subscription; `WebhookRegistry` port + in-memory adapter; `WebhookDispatcher` with fire-and-forget delivery and AbortController timeout
- **Background job queue** — polling-based in-memory job processor with configurable interval; exponential backoff retry (`min(1000 * 2^attempts, 60000)` ms); dead letter queue for exhausted retries; job lifecycle (PENDING → RUNNING → COMPLETED / FAILED → DEAD); `JobQueue` port ready to swap for Redis/SQLite-backed adapter
- 3 new core ports: `EventBus`, `WebhookRegistry`, `JobQueue`
- 7 new DI container tokens: `EventBus`, `EventFactory`, `WebhookRegistry`, `WebhookDispatcher`, `JobQueue`, `WebSocketManager`, `SseHandler`
- WebSocket JSON protocol: `auth`, `subscribe`, `unsubscribe`, `ping` client messages; `connected`, `auth_result`, `subscribed`, `event`, `pong`, `error` server messages
- 36 new tests across 4 new test files + expanded integration tests (246 → 282 total, 32 files, 667 expect() calls)

### Changed

- Router extended with webhook routes and SSE endpoint; new parametric matcher for `DELETE /api/v1/webhooks/:id`
- Server now conditionally enables Bun.serve() WebSocket config when `WebSocketManager` is provided
- `main.ts` bootstrap wires event bus, webhook dispatcher, job queue; webhook dispatcher auto-subscribed as wildcard event listener; WebSocket broadcast wired as wildcard subscriber; job queue starts after server and stops on graceful shutdown
- Version bumped to 1.5.0

---

## [1.4.0] - 2026-02-16

### Added

- **Email verification** — `POST /api/v1/auth/verify-email` with SHA-256 hashed, time-limited tokens (24h TTL); `VerificationTokenRepository` port + SQLite adapter; supports email-verification and password-reset token types
- **Password reset** — `POST /api/v1/auth/forgot-password` (non-enumerable, always returns 200) + `POST /api/v1/auth/reset-password` with secure token-based flow (1h TTL); prevents information disclosure about registered emails
- **Refresh token rotation** — one-time-use refresh tokens with family-based reuse detection; `RefreshTokenStore` port + SQLite adapter; token reuse revokes entire family to mitigate stolen token replay attacks
- **MFA / 2FA (TOTP)** — RFC 6238 TOTP implementation using `Bun.CryptoHasher` HMAC-SHA1; setup/enable/disable/verify endpoints; Google Authenticator-compatible `otpauth://` URI generation; base32 encoding (zero-dep); time-step window of ±1 for clock drift tolerance
- **OAuth2 / SSO** — Google and GitHub provider adapters with authorization URL generation and token exchange; `OAuthProvider` port + `OAuthAccountRepository` for provider-account linking; conditional registration based on `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_ID` environment variables
- **API key auth** — `POST /api/v1/api-keys` (create), `GET /api/v1/api-keys` (list), `DELETE /api/v1/api-keys/:id` (revoke); `oapi_` prefixed keys with SHA-256 hashed storage; `X-API-Key` header authentication; configurable scopes and expiry; `ApiKeyRepository` port + SQLite adapter
- **Password policy** — configurable complexity rules (min length, uppercase, lowercase, digit, special character); password history checking to prevent reuse of last N passwords; password expiry detection; `PasswordPolicy` service + `PasswordHistory` port + SQLite adapter
- Migration 004: `auth_platform` — creates `verification_tokens`, `refresh_tokens`, `api_keys`, `password_history`, `oauth_accounts` tables with appropriate indexes
- `TotpService` port + infrastructure adapter (RFC 6238, HMAC-SHA1 via Bun.CryptoHasher, base32 codec)
- 9 new DI container tokens: `VerificationTokenRepository`, `RefreshTokenStore`, `ApiKeyRepository`, `PasswordHistory`, `PasswordPolicy`, `TotpService`, `OAuthProviders`, `OAuthAccountRepository`, `ApiKeyService`
- Password policy config section: `PASSWORD_MIN_LENGTH`, `PASSWORD_REQUIRE_UPPERCASE`, `PASSWORD_REQUIRE_LOWERCASE`, `PASSWORD_REQUIRE_DIGIT`, `PASSWORD_REQUIRE_SPECIAL`, `PASSWORD_HISTORY_COUNT`, `PASSWORD_MAX_AGE_DAYS`
- OAuth config section: `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`
- 68 new tests across 7 new test files + expanded integration tests (178 → 246 total, 28 files, 589 expect() calls)

### Changed

- `AuthService` now accepts 13 dependencies (was 6): adds verification tokens, refresh token store, TOTP service, OAuth providers, OAuth accounts, API key repository, password history, password policy
- `User` entity extended with `emailVerified`, `mfaEnabled`, `mfaSecret`, `passwordChangedAt` fields
- `InMemoryUserRepository` updated to initialize and handle all new user fields
- Router now supports OAuth, MFA, API key, and email verification route groups
- Startup banner displays v1.4.0; pruning interval covers verification tokens and refresh tokens in addition to blacklisted JWT tokens
- Version bumped to 1.4.0

---

## [1.3.0] - 2026-02-15

### Added

- **Prometheus metrics** — `GET /metrics` endpoint serving Prometheus text exposition format (v0.0.4) with counters, histograms, and gauges: `http_requests_total`, `http_request_duration_ms`, `http_active_connections`, `http_errors_total`, `circuit_breaker_state`, `alerts_sent_total`
- **OpenTelemetry traces** — W3C Trace Context propagation (`traceparent` header), 128-bit trace IDs + 64-bit span IDs generated per request, trace context included in structured JSON logs and response headers
- **Circuit breaker** — resilience pattern for external service calls with configurable failure threshold, reset timeout, and half-open success threshold; state machine (CLOSED → OPEN → HALF_OPEN → CLOSED); `CircuitBreaker` port + infrastructure adapter
- **Retry with backoff** — configurable retry policy with exponential backoff, jitter, max delay cap, retryable predicate, and per-attempt callbacks; `RetryPolicy` port + infrastructure adapter
- **Graceful degradation** — health service now monitors circuit breaker states; reports `degraded` status when downstream services fail; `GET /readiness` reflects circuit breaker health in component checks
- **Alerting hooks** — `AlertSink` port with webhook adapter (`ALERT_WEBHOOK_URL`); fires on circuit breaker OPEN/recovery, unhandled rejections; `createNoopAlertSink` when no URL configured; retry with backoff on webhook delivery failures
- `MetricsCollector` port with zero-dependency Prometheus adapter (counters, histograms with configurable buckets, gauges with label support)
- `CircuitBreakerOptions` config section (`CB_FAILURE_THRESHOLD`, `CB_RESET_TIMEOUT_MS`, `CB_HALF_OPEN_SUCCESS_THRESHOLD`)
- `AlertSink` config section (`ALERT_WEBHOOK_URL`, `ALERT_TIMEOUT_MS`)
- `TraceContext` type with `traceId`, `spanId`, `parentSpanId`, `flags`
- `RequestContext` extended with `trace: TraceContext` field
- Child loggers now include `traceId` and `spanId` bindings for structured log correlation
- New DI tokens: `MetricsCollector`, `AlertSink`
- 58 new tests (120 → 178 total across 21 files)

### Changed

- `ComponentHealth.status` now supports `"degraded"` in addition to `"ok"` | `"down"`
- `HealthService` accepts optional `circuitBreakers` array for graceful degradation monitoring
- Server hot path now tracks metrics (request count, duration, active connections, errors) without measurable latency impact
- All responses now include `traceparent` header for distributed tracing correlation
- Unhandled promise rejections now fire alerting hooks in addition to logging

---

## [1.2.0] - 2026-02-15

### Added

- **Admin endpoints** — `GET /api/v1/admin/users` (list, search, filter by role), `GET /api/v1/admin/users/:id`, `PATCH /api/v1/admin/users/:id/role`, `POST /api/v1/admin/users/:id/ban`, `POST /api/v1/admin/users/:id/unban`
- **Cursor-based pagination** — opaque base64 cursor, `?cursor=X&limit=20` on list endpoints, `PaginatedResult<T>` type
- **OpenAPI 3.1 specification** — auto-generated from Zod schemas at `GET /docs` (JSON) and `GET /docs/html` (embedded Swagger UI)
- **ETag / conditional requests** — MD5-based ETag on GET 200 responses, `If-None-Match` → 304 Not Modified
- **Request ID tracing** — per-request child logger with `requestId` binding, propagated via `X-Request-Id` header
- **Structured JSON log mode** — `LOG_FORMAT=json` for production log aggregators (Datadog, ELK, CloudWatch)
- **Audit log** — append-only ledger of significant system events (who, what, when, IP), SQLite-backed with `AuditLog` port
- `AdminService` with role-based authorization, self-action prevention
- `AuditLog` port + SQLite adapter with query filters (userId, action, since, limit)
- Migration 003: `audit_log` table with indexes
- Parametric route matching for admin endpoints (prefix-based, O(1) static + O(n) parametric)
- Admin DTOs: `listUsersDto`, `changeRoleDto`, `banUserDto` validated via Zod
- `UserRepository` extended with `list(options)` and `count()` methods
- 30 new tests (90 unit + 30 integration = 120 total)
- `LOG_FORMAT` config option (`pretty` | `json`)

### Changed

- `authorise()` middleware now returns 403 Forbidden (was incorrectly 401) for role mismatches
- Logger `createLogger()` accepts optional `format` parameter (`"pretty"` | `"json"`)
- `RequestContext` includes request-scoped `logger` field
- Router supports both static O(1) map and parametric admin route matching
- Version bumped to 1.2.0 in package.json and startup banner
- CLI startup banner displays new admin + docs routes and log format
- Biome config: `useLiteralKeys` disabled globally (incompatible with TS `noPropertyAccessFromIndexSignature`)
- Migration tests updated for 3-migration schema

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
