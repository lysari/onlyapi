# Architecture

onlyApi follows **Clean Architecture** (Hexagonal / Ports & Adapters) with four distinct layers. Dependencies flow inward — the domain core has zero dependencies on frameworks, databases, or HTTP.

---

## Layer Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Presentation                          │
│   HTTP server, routes, handlers, middleware, i18n        │
│   ┌──────────────────────────────────────────────────┐   │
│   │                  Application                     │   │
│   │   Services (use cases), DTOs (Zod schemas)       │   │
│   │   ┌──────────────────────────────────────────┐   │   │
│   │   │                  Core                    │   │   │
│   │   │   Entities, Ports (interfaces),          │   │   │
│   │   │   Result<T,E>, Branded types, Errors     │   │   │
│   │   └──────────────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────┘   │
│   Infrastructure                                         │
│   Config, DB adapters, cache, security, events, logging  │
└──────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── core/                      # Domain — ZERO dependencies
│   ├── entities/              # Domain models
│   │   └── user.entity.ts     # User, UserRole, UserView
│   ├── errors/                # Error types
│   │   └── app-error.ts       # AppError, ErrorCode, factory functions
│   ├── ports/                 # Interfaces (dependency boundaries)
│   │   ├── logger.ts
│   │   ├── password-hasher.ts
│   │   ├── token-service.ts
│   │   ├── user.repository.ts
│   │   ├── cache.ts
│   │   ├── event-bus.ts
│   │   ├── webhook.ts
│   │   ├── job-queue.ts
│   │   ├── metrics.ts
│   │   ├── account-lockout.ts
│   │   ├── audit-log.ts
│   │   ├── circuit-breaker.ts
│   │   ├── api-key.ts
│   │   ├── alert-sink.ts
│   │   ├── oauth.ts
│   │   ├── password-history.ts
│   │   ├── password-policy.ts
│   │   ├── refresh-token-store.ts
│   │   ├── token-blacklist.ts
│   │   ├── totp-service.ts
│   │   ├── verification-token.ts
│   │   └── retry.ts
│   └── types/                 # Type utilities
│       ├── result.ts          # Result<T,E> monad
│       ├── brand.ts           # Branded types (UserId, Timestamp, etc.)
│       └── pagination.ts      # CursorParams, PaginatedResult
│
├── application/               # Use cases
│   ├── dtos/                  # Zod validation schemas
│   │   ├── auth.dto.ts        # register, login, refresh, MFA, OAuth...
│   │   └── admin.dto.ts       # listUsers, changeRole, banUser
│   └── services/              # Business logic orchestration
│       ├── auth.service.ts    # Register, login, refresh, logout, MFA...
│       ├── user.service.ts    # Profile CRUD
│       ├── health.service.ts  # Health and readiness checks
│       ├── admin.service.ts   # User management, roles, bans
│       └── api-key.service.ts # API key lifecycle
│
├── infrastructure/            # Adapters (implement ports)
│   ├── config/
│   │   └── config.ts          # Zod-validated environment config
│   ├── database/
│   │   ├── in-memory-user.repository.ts
│   │   ├── sqlite/            # SQLite adapters + migrations
│   │   └── postgres/          # PostgreSQL adapters + migrations
│   ├── cache/
│   │   ├── in-memory-cache.ts
│   │   └── redis-cache.ts     # Raw RESP protocol
│   ├── logging/
│   │   └── logger.ts          # Pretty + JSON, batched async
│   ├── security/
│   │   ├── password-hasher.ts # Argon2id via Bun.password
│   │   ├── token-service.ts   # HMAC-SHA256 JWT via Web Crypto
│   │   ├── totp-service.ts    # RFC 6238 TOTP
│   │   ├── password-policy.ts # Complexity, history, expiry
│   │   └── oauth/             # Google, GitHub adapters
│   ├── events/
│   │   ├── event-bus.ts       # In-memory pub/sub
│   │   ├── event-factory.ts   # Domain event creation
│   │   ├── webhook-dispatcher.ts
│   │   ├── webhook-registry.ts
│   │   └── job-queue.ts       # Background jobs
│   ├── resilience/
│   │   ├── circuit-breaker.ts
│   │   └── retry-policy.ts
│   └── observability/
│       ├── metrics.ts         # Prometheus counters/histograms/gauges
│       ├── tracing.ts         # W3C Trace Context
│       └── alert-sink.ts      # Webhook alerting
│
├── presentation/              # HTTP layer
│   ├── server.ts              # Bun.serve() hot-path
│   ├── context.ts             # RequestContext type
│   ├── routes/
│   │   └── router.ts          # O(1) Map router
│   ├── handlers/
│   │   ├── auth.handler.ts
│   │   ├── user.handler.ts
│   │   ├── admin.handler.ts
│   │   ├── health.handler.ts
│   │   ├── api-key.handler.ts
│   │   ├── oauth.handler.ts
│   │   ├── webhook.handler.ts
│   │   ├── sse.handler.ts
│   │   ├── websocket.handler.ts
│   │   ├── metrics.handler.ts
│   │   ├── openapi.handler.ts
│   │   └── response.ts        # jsonResponse, errorResponse, etc.
│   ├── middleware/
│   │   ├── auth.ts            # authenticate, authorise
│   │   ├── cors.ts            # CORS headers, preflight
│   │   ├── rate-limit.ts      # Fixed-window per-IP
│   │   ├── security-headers.ts
│   │   ├── validate.ts        # Zod body validation
│   │   ├── versioning.ts      # API version normalisation
│   │   └── api-key.ts         # X-API-Key authentication
│   └── i18n/
│       └── index.ts           # 5 languages, Accept-Language parsing
│
├── shared/                    # Cross-cutting
│   ├── container.ts           # Symbol-based DI container
│   ├── cli.ts                 # CLI utilities
│   ├── log-format.ts          # Log formatting helpers
│   └── utils/
│       ├── id.ts              # crypto.randomUUID()
│       └── timing-safe.ts     # Constant-time string comparison
│
├── cli/                       # CLI tool
│   ├── index.ts               # Entry point
│   ├── ui.ts                  # Terminal UI utilities
│   └── commands/
│       ├── init.ts            # bunx onlyapi init <name>
│       ├── upgrade.ts         # onlyapi upgrade
│       └── help.ts            # Help text
│
├── main.ts                    # Bootstrap + graceful shutdown
└── cluster.ts                 # SO_REUSEPORT multi-process
```

---

## The Dependency Rule

The most important architectural constraint: **dependencies only point inward**.

```
Presentation → Application → Core ← Infrastructure
```

- **Core** depends on nothing. It defines ports (interfaces) that the outer layers implement.
- **Application** depends only on Core. It orchestrates business logic through ports.
- **Infrastructure** implements Core ports. It depends on Core interfaces but not on Application or Presentation.
- **Presentation** depends on Application services. It translates HTTP ↔ application layer.

This means:

- You can swap SQLite for PostgreSQL without touching any business logic
- You can replace the HTTP layer without changing services
- You can test application services with in-memory adapters
- You can add a new database driver by implementing the repository port

---

## Dependency Injection

### Symbol-Based Container

The DI container uses ES `Symbol` keys for type-safe, collision-free injection:

```typescript
// Define tokens
const TOKENS = {
  Logger: Symbol("Logger"),
  UserRepository: Symbol("UserRepository"),
  PasswordHasher: Symbol("PasswordHasher"),
  // ... 30+ tokens
};

// Register
Container.register(TOKENS.Logger, loggerInstance);
Container.register(TOKENS.UserRepository, sqliteUserRepository);

// Resolve
const logger = Container.resolve<Logger>(TOKENS.Logger);
const repo = Container.resolve<UserRepository>(TOKENS.UserRepository);
```

### Registration Sequence

At bootstrap (`main.ts`), services are registered in dependency order:

```
1. Config (Zod-validated)
2. Logger
3. Password Hasher (Argon2id)
4. Token Service (JWT)
5. Database (SQLite or PostgreSQL + migrations)
6. Cache (In-memory or Redis)
7. Security (TOTP, Password Policy, OAuth)
8. Events (Event Bus, Webhooks, Job Queue)
9. Observability (Metrics, Tracing, Alerting)
10. Application Services (Auth, User, Health, Admin)
11. Presentation (Router, WebSocket, Server)
```

### Container Lifecycle

- `Container.register(token, instance)` — register a singleton
- `Container.resolve<T>(token)` — retrieve (throws if not registered)
- `Container.reset()` — clear all registrations (used in tests)

---

## Branded Types

TypeScript's structural typing means a `string` for a user ID is interchangeable with a `string` for an email. Branded types prevent this:

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type RequestId = Brand<string, "RequestId">;
type Timestamp = Brand<number, "Timestamp">;
```

This provides **compile-time safety** — you cannot accidentally pass a `RequestId` where a `UserId` is expected. The brand is erased at runtime (zero overhead).

```typescript
function findById(id: UserId): Result<User>;

// ✅ Compiles
findById(brand<string, "UserId">("abc-123"));

// ❌ Does not compile
findById("abc-123");                    // plain string
findById(brand<string, "RequestId">("abc-123"));  // wrong brand
```

---

## Request Lifecycle

```
Request arrives at Bun.serve()
  │
  ├── Extract pathname (string slicing, no new URL())
  ├── Generate request ID (UUID v4)
  ├── Parse/propagate traceparent
  ├── Resolve i18n locale from Accept-Language
  │
  ├── CORS check
  │     ├── OPTIONS → 204 preflight response
  │     └── Other origin not allowed → 403
  │
  ├── Rate limit check (inlined, per-IP)
  │     └── Exceeded → 429 with Retry-After
  │
  ├── Build RequestContext { requestId, trace, logger, i18n, ... }
  │
  ├── Route lookup (O(1) Map)
  │     └── Not found → 404
  │
  ├── Handler execution
  │     ├── [Optional] authenticate() → verify JWT
  │     ├── [Optional] authorise() → check role
  │     ├── [Optional] validateBody() → Zod schema
  │     ├── Service call → Result<T, AppError>
  │     └── Build Response
  │
  ├── Apply security headers (pre-computed, frozen)
  ├── Apply CORS headers
  ├── Set rate limit headers
  ├── Generate ETag (GET 200)
  ├── Check If-None-Match → 304 if matched
  ├── Set API versioning headers
  ├── Set X-Request-Id
  ├── Set traceparent
  ├── Record metrics (duration, status)
  │
  └── Return Response
```

---

## Graceful Shutdown

On `SIGINT` or `SIGTERM`:

1. Stop accepting new connections
2. Clear periodic intervals (token pruning, log flushing)
3. Stop the background job queue
4. Flush pending log writes
5. Close the database connection
6. Close the cache connection (Redis QUIT)
7. Exit process
