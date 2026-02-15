# Security

onlyApi is designed with security as a first-class concern. Every layer — from password hashing to response headers — implements industry best practices with zero external dependencies.

---

## Password Hashing

### Argon2id

Passwords are hashed with **Argon2id** via `Bun.password.hash()` — no C bindings, no native modules.

| Parameter | Value |
|-----------|-------|
| Algorithm | Argon2id |
| Memory cost | 64 MiB |
| Time cost | 3 iterations |
| Parallelism | 1 |

Argon2id is the [OWASP recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) for password hashing and is resistant to GPU-based attacks.

### Timing-Safe Comparison

All security-sensitive string comparisons use a constant-time XOR-based comparison (`timingSafeEqual`) to prevent timing side-channel attacks.

---

## Security Headers

Every response includes the following headers, pre-computed at server startup (frozen object, zero runtime allocation):

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-XSS-Protection` | `0` | Disables legacy XSS filter (modern browsers use CSP) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for 2 years |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | No resources loaded, no framing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables browser APIs |
| `Cache-Control` | `no-store` | Prevents response caching |
| `Pragma` | `no-cache` | HTTP/1.0 cache prevention |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Flash/PDF cross-domain requests |

---

## CORS

Cross-Origin Resource Sharing is fully configurable.

### Configuration

```env
# Allow all origins (development)
CORS_ORIGINS=*

# Allow specific origins (production)
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

### CORS Headers

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | Matched origin (or `*`) |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, X-API-Key, X-Request-Id` |
| `Access-Control-Expose-Headers` | `X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, ETag, API-Version` |
| `Access-Control-Max-Age` | `86400` (24 hours) |
| `Access-Control-Allow-Credentials` | `true` |

### Preflight Handling

`OPTIONS` requests are handled immediately with a `204 No Content` response and cached for 24 hours. If the origin is not in the allowlist, a `403 Forbidden` is returned.

---

## Rate Limiting

### Configuration

```env
RATE_LIMIT_WINDOW_MS=60000      # 60 seconds
RATE_LIMIT_MAX_REQUESTS=100     # 100 requests per window
```

### How It Works

- **Fixed-window** rate limiting, per-IP
- Inlined on the hot path for zero function-call overhead
- Uses an in-memory `Map<string, { count, resetTime }>`

### Response Headers

Every response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1708099260
```

### When Exceeded

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  },
  "requestId": "uuid"
}
```

---

## Account Lockout

Protects against brute-force password attacks.

```env
LOCKOUT_MAX_ATTEMPTS=5           # Lock after 5 failures
LOCKOUT_DURATION_MS=900000       # 15 minutes
```

### Behaviour

1. Each failed login increments the counter for that email
2. At `LOCKOUT_MAX_ATTEMPTS`, the account is locked
3. During lockout, login returns `429 Rate Limited` with `Retry-After`
4. After `LOCKOUT_DURATION_MS`, the counter resets
5. A successful login resets the counter immediately

Events emitted: `account.locked`, `account.unlocked`

---

## Token Security

### Access Tokens

- HMAC-SHA256 signed via Web Crypto API
- Short-lived (default 15 minutes)
- Contains `sub`, `email`, `role`, `type`, `iat`, `exp`
- Stateless verification (no database lookup)

### Refresh Tokens

- One-time-use with family-based rotation
- Replay detection revokes the entire family
- Stored hashes in the database for reuse detection
- Long-lived (default 7 days)

### Token Blacklist

- Logout adds both token hashes to the blacklist
- Blacklisted tokens rejected even if not expired
- Automatic pruning every 10 minutes

### Verification Tokens

- SHA-256 hashed before storage (raw token never stored)
- Time-limited: 24 hours for email verification, 1 hour for password reset
- Single-use: marked as consumed after verification

---

## Result Monad — No Thrown Exceptions

onlyApi uses a `Result<T, E>` type for all fallible operations. Errors are explicit return values, never thrown exceptions:

```typescript
type Result<T, E = AppError> = Ok<T> | Err<E>;
```

This means:

- **No stack trace leaks** — errors are captured values, not thrown objects
- **No surprise crashes** — every error path is handled at compile time
- **No internal state exposure** — error messages are controlled by `AppError` factory functions
- **No catch-all try/catch** — the type system enforces error handling

### Error Factory Functions

| Factory | HTTP Status | Use Case |
|---------|-------------|----------|
| `badRequest(message)` | 400 | Invalid input, business rule violation |
| `unauthorized(message)` | 401 | Authentication failure |
| `forbidden(message)` | 403 | Role/permission check failure |
| `notFound(resource)` | 404 | Entity not found |
| `conflict(message)` | 409 | Duplicate resource |
| `rateLimited(message)` | 429 | Rate limit exceeded |
| `validation(details)` | 422 | Schema validation failure |
| `internal(message, cause)` | 500 | Unexpected error (cause logged, not exposed) |

### Error Response Shape

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

The `cause` is never sent to the client — it appears only in server logs.

---

## Request ID Tracing

Every request is assigned a UUID (`X-Request-Id`), which is:

1. Generated at the start of request processing
2. Bound to the child logger for that request
3. Included in the error response body (`requestId` field)
4. Echoed in the `X-Request-Id` response header
5. Available in the `RequestContext` for downstream services

This enables end-to-end request tracing across logs and error reports.

---

## W3C Trace Context

The server propagates W3C Trace Context headers for distributed tracing:

```
traceparent: 00-<128-bit-trace-id>-<64-bit-span-id>-01
```

- If the request includes a `traceparent` header, it is parsed and propagated
- If missing, a new trace ID and span ID are generated
- The `traceparent` header is included in every response

This integrates with OpenTelemetry, Datadog, Jaeger, and any W3C-compatible tracer.

---

## Request Body Limits

| Setting | Value |
|---------|-------|
| Max request body | 1 MiB |
| Idle timeout | 30 seconds |

Requests exceeding 1 MiB are rejected by Bun before reaching application code.

---

## Password Policy

See [Authentication — Password Policy](authentication.md#password-policy) for the full configuration reference.

Summary:

- Configurable minimum length, character requirements
- Password history prevents reuse of recent N passwords
- Optional password expiry (force reset after N days)
- Policy enforced on registration, update, and reset
