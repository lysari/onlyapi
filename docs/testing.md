# Testing

onlyApi has 351 tests across 36 files, covering four testing layers: unit, integration, end-to-end, and load testing.

---

## Running Tests

```bash
# All tests
bun test

# Watch mode (re-runs on file changes)
bun test --watch

# Coverage report
bun run test:coverage

# Specific layer
bun test tests/unit/
bun test tests/integration/
bun test tests/e2e/

# Specific file
bun test tests/unit/result.test.ts

# Pattern match
bun test --grep "auth"
```

---

## Test Structure

```
tests/
├── unit/                         # 267 tests
│   ├── result.test.ts            # Result<T,E> monad
│   ├── app-error.test.ts         # AppError factory functions
│   ├── password-hasher.test.ts   # Argon2id hashing
│   ├── token-service.test.ts     # JWT sign/verify/refresh
│   ├── user-repository.test.ts   # In-memory repository
│   ├── totp.test.ts              # RFC 6238 TOTP
│   ├── password-policy.test.ts   # Complexity, history, expiry
│   ├── cache.test.ts             # In-memory cache
│   ├── i18n.test.ts              # Locale resolution, translations
│   ├── versioning.test.ts        # API version headers
│   ├── event-bus.test.ts         # Event pub/sub
│   ├── webhook.test.ts           # Webhook registry and dispatch
│   ├── job-queue.test.ts         # Background job processing
│   ├── circuit-breaker.test.ts   # Circuit breaker states
│   ├── retry.test.ts             # Retry with backoff
│   ├── metrics.test.ts           # Prometheus serialisation
│   ├── tracing.test.ts           # W3C Trace Context
│   └── ...
│
├── integration/                  # 56 tests
│   └── server.test.ts            # Full HTTP lifecycle
│
├── e2e/                          # 28 tests
│   └── journey.test.ts           # Complete user journey
│
└── load/                         # Load test harness
    └── harness.ts                # Automated performance regression
```

---

## Unit Tests

Unit tests verify individual components in isolation with in-memory adapters. No HTTP server, no database, no network calls.

### What's Tested

| Component | Tests | Description |
|-----------|-------|-------------|
| `Result<T,E>` | ok/err creation, map, flatMap, unwrapOr, tryCatch, tryCatchAsync | Monad correctness |
| `AppError` | Factory functions, HTTP status mapping, error codes | Error handling |
| `PasswordHasher` | Hash, verify, invalid inputs, timing | Argon2id |
| `TokenService` | Sign, verify, refresh, expiry, rotation, blacklist detection | JWT |
| `UserRepository` | CRUD, findByEmail, list, count, pagination | In-memory adapter |
| `TOTP` | Secret generation, URI format, verify, window drift, Base32 | MFA |
| `PasswordPolicy` | Length, uppercase, lowercase, digit, special, history, expiry | Validation |
| `Cache` | Get/set, TTL, delete, has, incr, delPattern, expiration | In-memory |
| `i18n` | Locale parsing, resolution, fallback, all 5 languages, all 33 keys | Translations |
| `API Versioning` | Path normalisation, header injection, deprecation | Versioning |
| `EventBus` | Publish, subscribe, subscribeAll, error isolation | Events |
| `WebhookRegistry` | Create, list, findByEvent, remove, delivery recording | Webhooks |
| `JobQueue` | Submit, process, retry, dead letter, stats | Background jobs |
| `CircuitBreaker` | State transitions, thresholds, timeout, half-open | Resilience |
| `RetryPolicy` | Max retries, backoff, jitter, retryable predicate | Resilience |
| `Metrics` | Counter increment, histogram observe, gauge set, serialisation | Prometheus |
| `Tracing` | TraceContext generation, propagation, parsing | Distributed tracing |

### Example Unit Test

```typescript
import { describe, test, expect } from "bun:test";
import { ok, err, type Result } from "@core/types/result";

describe("Result", () => {
  test("ok() creates a success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  test("err() creates a failure result", () => {
    const result = err("something went wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("something went wrong");
  });

  test("map transforms the value", () => {
    const result = ok(5).map((n) => n * 2);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(10);
  });

  test("map is a no-op on Err", () => {
    const result = err("fail").map((n) => n * 2);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("fail");
  });
});
```

---

## Integration Tests

Integration tests verify the full HTTP lifecycle — request in, response out — using a real server instance with in-memory adapters.

### What's Tested

| Area | Tests | Description |
|------|-------|-------------|
| Health | Shallow check, deep readiness, response shape | `/health`, `/readiness` |
| Auth | Register, login, refresh, logout, duplicate email, invalid credentials | Full auth flow |
| Email verification | Send, verify, resend, expired token | Verification flow |
| MFA | Setup, enable, disable, login with TOTP, invalid code | MFA lifecycle |
| API Keys | Create, list, revoke, use X-API-Key header | API key flow |
| Password policy | Weak password rejection, history check | Policy enforcement |
| Webhooks | Create, list, remove, event delivery | Webhook management |
| SSE | Connect, receive events, heartbeat | Event streaming |
| CORS | Allowed origins, blocked origins, preflight | Cross-origin |
| Rate limiting | Within limit, exceeded, Retry-After header | Rate control |
| Security headers | All headers present in responses | Header verification |
| 404 | Unknown routes return proper error | Not found |
| Error format | Error envelope, validation errors, request ID | Error consistency |

### Example Integration Test

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("Authentication", () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.stop();
  });

  test("register creates a new user and returns tokens", async () => {
    const res = await fetch(`${server.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "Str0ngP@ss!"
      })
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  test("login with wrong password returns 401", async () => {
    const res = await fetch(`${server.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "WrongPassword"
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
```

---

## End-to-End Tests

E2E tests run against a live server process (spawned as a child process) and test the complete user journey.

### Journey

The E2E test suite follows a single user through their entire lifecycle:

1. **Register** → Create account, receive tokens
2. **Login** → Authenticate, receive new tokens
3. **Profile** → Get user profile
4. **Update profile** → Change email
5. **Refresh token** → Get new token pair
6. **API versioning** → Verify v1 deprecation headers, v2 clean headers
7. **i18n** → Spanish locale returns Spanish error messages
8. **ETag / 304** → Conditional GET returns Not Modified
9. **Security headers** → All 10 headers present
10. **Logout** → Invalidate tokens
11. **Post-logout** → Refresh token is rejected

### Running E2E Tests

```bash
bun test tests/e2e/
```

The test suite:
1. Spawns a server process with test configuration
2. Waits for the health check to pass
3. Runs all 28 tests sequentially
4. Kills the server process on completion

---

## Load Tests

Automated performance regression detection.

### Running

```bash
bun run tests/load/harness.ts
```

### Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | `http://localhost:3000` | Target URL |
| `--duration` | `10s` | Test duration |
| `--connections` | `50` | Concurrent connections |
| `--target-rps` | `1000` | Target requests per second |

### Threshold Checks

The harness checks latency and throughput against configurable thresholds:

| Metric | Default Threshold |
|--------|-------------------|
| p50 latency | < 10ms |
| p90 latency | < 25ms |
| p95 latency | < 50ms |
| p99 latency | < 100ms |
| Throughput | > 500 req/s |
| Error rate | < 1% |

If any threshold is exceeded, the harness exits with code 1 — suitable for CI pipelines.

### Example Output

```
Load Test Results
─────────────────
Duration:     10.0s
Requests:     12,345
Throughput:   1,234 req/s
Error Rate:   0.00%

Latency Distribution
  p50:    2.3ms  ✅ (< 10ms)
  p90:    5.7ms  ✅ (< 25ms)
  p95:    8.1ms  ✅ (< 50ms)
  p99:   15.4ms  ✅ (< 100ms)

All thresholds passed ✅
```

---

## Testing Guidelines

### Writing Unit Tests

1. **Test one thing** per test case
2. **Use descriptive names**: `"returns UNAUTHORIZED when token is expired"`
3. **Follow AAA**: Arrange → Act → Assert
4. **Use in-memory adapters** from `src/infrastructure/database/in-memory-*`
5. **Don't test private methods** — test through the public API
6. **Reset state** between tests using `beforeEach` or `Container.reset()`

### Writing Integration Tests

1. **Start a real server** with in-memory adapters
2. **Use `fetch()`** for HTTP requests
3. **Test the full flow**: request → middleware → handler → service → response
4. **Verify response shape**: status code, body structure, headers
5. **Clean up**: stop the server in `afterAll`

### Running in CI

```yaml
# GitHub Actions
- run: bun test
  env:
    NODE_ENV: test
    JWT_SECRET: test-secret-that-is-at-least-32-characters
```

All tests use in-memory adapters by default — no database or cache setup required in CI.
