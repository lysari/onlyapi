# API Reference

Complete reference for every HTTP endpoint. All endpoints return JSON. All responses include security headers, request ID, and rate limit headers.

---

## Response Envelope

Every response follows a consistent envelope:

**Success** (200, 201):

```json
{
  "data": { ... }
}
```

**No Content** (204):

Empty body.

**Error** (4xx, 5xx):

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation Error** (422):

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "password", "message": "Must be at least 8 characters" }
    ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Common Headers

### Request Headers

| Header | Description |
|--------|-------------|
| `Authorization` | `Bearer <accessToken>` — required for authenticated endpoints |
| `Content-Type` | `application/json` — required for POST/PATCH/PUT/DELETE with body |
| `Accept-Language` | RFC 7231 language negotiation (e.g., `es`, `de,en;q=0.5`) |
| `If-None-Match` | ETag value for conditional GET requests |
| `X-API-Key` | API key for service-to-service authentication |

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique UUID for each request — use for debugging |
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `API-Version` | `v1` or `v2` |
| `Content-Language` | Resolved locale (e.g., `en`, `es`) |
| `traceparent` | W3C Trace Context header |
| `ETag` | Entity tag for conditional requests (GET 200 only) |
| `Retry-After` | Seconds to wait (only on 429 responses) |

### Security Headers (always present)

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cache-Control` | `no-store` |
| `Pragma` | `no-cache` |
| `X-Permitted-Cross-Domain-Policies` | `none` |

---

## Health & Observability

### `GET /health`

Shallow health check. Pre-serialised response (zero `JSON.stringify` overhead). Suitable for load balancer probes.

**Auth**: None

**Response** `200`:

```json
{
  "data": {
    "status": "ok",
    "version": "1.5.0",
    "uptime": 3600.123,
    "timestamp": "2026-02-16T12:00:00.000Z"
  }
}
```

---

### `GET /readiness`

Deep readiness check. Tests database connectivity, cache health, and circuit breaker states. Use for Kubernetes readiness probes.

**Auth**: None

**Response** `200`:

```json
{
  "data": {
    "status": "ok",
    "version": "1.5.0",
    "uptime": 3600.123,
    "timestamp": "2026-02-16T12:00:00.000Z",
    "checks": {
      "memory": { "status": "ok", "heapUsed": 45678912, "heapTotal": 67108864 },
      "circuitBreaker": { "status": "ok", "state": "CLOSED" }
    }
  }
}
```

Possible `status` values: `ok`, `degraded`, `down`.

---

### `GET /docs`

OpenAPI 3.1 specification in JSON format. Auto-generated from Zod schemas. Cached after first request.

**Auth**: None

**Response** `200`: OpenAPI JSON document

---

### `GET /docs/html`

Interactive Swagger UI for exploring the API.

**Auth**: None

**Response** `200`: HTML page

---

### `GET /metrics`

Prometheus-compatible metrics in text exposition format v0.0.4.

**Auth**: None

**Response** `200`:

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/health",status="200"} 42

# HELP http_request_duration_ms HTTP request latency
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="1"} 100
http_request_duration_ms_bucket{le="5"} 150
...
```

---

## Authentication

### `POST /api/v1/auth/register`

Create a new user account and receive a JWT token pair.

**Auth**: None

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "Str0ngP@ss!"
}
```

| Field | Type | Validation |
|-------|------|------------|
| `email` | `string` | Valid email, max 255 chars, trimmed, lowercased |
| `password` | `string` | Min 8 chars, max 128. Must meet password policy |

**Response** `201`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 409 | `CONFLICT` | Email already registered |
| 422 | `VALIDATION` | Invalid email or password format |
| 400 | `BAD_REQUEST` | Password does not meet policy requirements |

---

### `POST /api/v1/auth/login`

Authenticate with email and password. If MFA is enabled, a temporary MFA token is returned instead.

**Auth**: None

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "Str0ngP@ss!"
}
```

**Response** `200` (without MFA):

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response** `200` (MFA required):

```json
{
  "data": {
    "mfaRequired": true,
    "mfaToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

Use the `mfaToken` with [`POST /api/v1/auth/mfa/verify`](#post-apiv1authmfaverify) to complete login.

**Errors**:

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Invalid email or password |
| 429 | `RATE_LIMITED` | Account temporarily locked after too many attempts |
| 400 | `BAD_REQUEST` | Password expired — must reset |

---

### `POST /api/v1/auth/refresh`

Exchange a valid refresh token for a new token pair. Uses one-time-use rotation with family-based reuse detection.

**Auth**: None

**Request Body**:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Token invalid, expired, or already used |

> **Security**: If a previously used refresh token is submitted (replay attack), the entire token family is revoked — all sessions for that user are invalidated.

---

### `POST /api/v1/auth/logout`

Invalidate both access and refresh tokens.

**Auth**: `Bearer <accessToken>`

**Request Body**:

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `204`: No content

**Errors**:

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 422 | `VALIDATION` | Missing refreshToken in body |

---

### `POST /api/v1/auth/verify-email`

Verify a user's email address with a verification token.

**Auth**: None

**Request Body**:

```json
{
  "token": "abc123..."
}
```

**Response** `200`:

```json
{
  "data": {
    "message": "Email verified successfully"
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Token invalid or expired |

---

### `POST /api/v1/auth/resend-verification`

Resend the email verification token. Invalidates any existing tokens first.

**Auth**: `Bearer <accessToken>`

**Response** `200`:

```json
{
  "data": {
    "token": "new-verification-token..."
  }
}
```

> In a real deployment, this token would be sent via email. The response includes it directly for development convenience.

---

### `POST /api/v1/auth/forgot-password`

Initiate a password reset flow. Returns success even if the email is not found (to prevent email enumeration).

**Auth**: None

**Request Body**:

```json
{
  "email": "user@example.com"
}
```

**Response** `200`:

```json
{
  "data": {
    "token": "reset-token...",
    "message": "If the email exists, a reset token has been generated"
  }
}
```

---

### `POST /api/v1/auth/reset-password`

Reset password using a valid reset token. Validates the new password against the password policy and history.

**Auth**: None

**Request Body**:

```json
{
  "token": "reset-token...",
  "password": "N3wStr0ngP@ss!"
}
```

**Response** `200`:

```json
{
  "data": {
    "message": "Password reset successfully"
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Invalid/expired token, or password doesn't meet policy |

> After a password reset, all existing refresh tokens for the user are revoked.

---

## Multi-Factor Authentication (MFA)

### `POST /api/v1/auth/mfa/setup`

Generate a TOTP secret and provisioning URI for QR code scanning.

**Auth**: `Bearer <accessToken>`

**Response** `200`:

```json
{
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "uri": "otpauth://totp/onlyApi:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=onlyApi&digits=6&period=30"
  }
}
```

Display the `uri` as a QR code. The user scans it with Google Authenticator, Authy, or any TOTP app.

---

### `POST /api/v1/auth/mfa/enable`

Enable MFA after verifying a TOTP code from the authenticator app.

**Auth**: `Bearer <accessToken>`

**Request Body**:

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "code": "123456"
}
```

| Field | Type | Validation |
|-------|------|------------|
| `secret` | `string` | The secret from `/mfa/setup` |
| `code` | `string` | Exactly 6 digits from authenticator app |

**Response** `200`:

```json
{
  "data": {
    "message": "MFA enabled successfully"
  }
}
```

---

### `POST /api/v1/auth/mfa/disable`

Disable MFA. Requires a valid TOTP code to confirm.

**Auth**: `Bearer <accessToken>`

**Request Body**:

```json
{
  "code": "123456"
}
```

**Response** `200`:

```json
{
  "data": {
    "message": "MFA disabled successfully"
  }
}
```

---

### `POST /api/v1/auth/mfa/verify`

Complete MFA login. Use the `mfaToken` received from the login response.

**Auth**: None (uses `mfaToken`)

**Request Body**:

```json
{
  "mfaToken": "eyJhbGciOiJIUzI1NiIs...",
  "code": "123456"
}
```

**Response** `200`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## OAuth2

### `GET /api/v1/auth/oauth/:provider`

Redirect to the OAuth2 provider's authorization page.

**Auth**: None

**Path Parameters**:

| Parameter | Values |
|-----------|--------|
| `provider` | `google`, `github` |

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `redirect_uri` | Your callback URL |

**Response** `302`: Redirects to provider's consent screen.

---

### `POST /api/v1/auth/oauth/:provider/callback`

Exchange the OAuth2 authorization code for tokens. If the OAuth account is not linked to a local user, one is created automatically.

**Auth**: None

**Request Body**:

```json
{
  "code": "oauth-authorization-code",
  "state": "csrf-state-token"
}
```

**Response** `200`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## User Profile

### `GET /api/v1/users/me`

Get the current user's profile. Sensitive fields (`passwordHash`, `mfaSecret`) are never exposed.

**Auth**: `Bearer <accessToken>`

**Response** `200`:

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "user",
    "createdAt": 1708099200000,
    "updatedAt": 1708099200000
  }
}
```

---

### `PATCH /api/v1/users/me`

Update the current user's email or password.

**Auth**: `Bearer <accessToken>`

**Request Body** (all fields optional):

```json
{
  "email": "new-email@example.com",
  "password": "N3wP@ssw0rd!"
}
```

**Response** `200`:

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "new-email@example.com",
    "role": "user",
    "createdAt": 1708099200000,
    "updatedAt": 1708099300000
  }
}
```

---

### `DELETE /api/v1/users/me`

Permanently delete the current user's account.

**Auth**: `Bearer <accessToken>`

**Response** `204`: No content

---

## API Keys

API keys provide service-to-service authentication. Pass the key via the `X-API-Key` header.

### `POST /api/v1/api-keys`

Create a new API key. The raw key is returned **once** — store it securely.

**Auth**: `Bearer <accessToken>`

**Request Body**:

```json
{
  "name": "CI Pipeline",
  "scopes": ["read:users", "write:users"],
  "expiresInDays": 90
}
```

| Field | Type | Validation |
|-------|------|------------|
| `name` | `string` | 1–100 characters |
| `scopes` | `string[]` | Array of scope strings, max 20 items |
| `expiresInDays` | `number` | Optional. 1–365. If omitted, the key does not expire |

**Response** `201`:

```json
{
  "data": {
    "id": "key-id-uuid",
    "name": "CI Pipeline",
    "rawKey": "oapi_abc123...xyz",
    "scopes": ["read:users", "write:users"],
    "expiresAt": 1716000000000,
    "createdAt": 1708099200000
  }
}
```

> **Warning**: `rawKey` is only returned on creation. It cannot be retrieved later.

---

### `GET /api/v1/api-keys`

List all API keys for the authenticated user.

**Auth**: `Bearer <accessToken>`

**Response** `200`:

```json
{
  "data": [
    {
      "id": "key-id-uuid",
      "name": "CI Pipeline",
      "scopes": ["read:users", "write:users"],
      "lastUsedAt": 1708099500000,
      "expiresAt": 1716000000000,
      "createdAt": 1708099200000
    }
  ]
}
```

---

### `DELETE /api/v1/api-keys/:id`

Revoke an API key. Takes effect immediately.

**Auth**: `Bearer <accessToken>`

**Path Parameters**:

| Parameter | Description |
|-----------|-------------|
| `id` | The API key ID to revoke |

**Response** `204`: No content

---

## Webhooks

Webhooks send HTTP POST requests to your URL when domain events occur. Admin access required.

### `POST /api/v1/webhooks`

Register a new webhook subscription.

**Auth**: `Bearer <accessToken>` (admin role required)

**Request Body**:

```json
{
  "url": "https://hooks.example.com/onlyapi",
  "secret": "webhook-signing-secret",
  "events": ["user.registered", "login.failed", "account.locked"]
}
```

**Response** `201`:

```json
{
  "data": {
    "id": "webhook-id-uuid",
    "url": "https://hooks.example.com/onlyapi",
    "events": ["user.registered", "login.failed", "account.locked"],
    "active": true,
    "createdAt": 1708099200000
  }
}
```

**Webhook delivery format**:

```http
POST https://hooks.example.com/onlyapi
Content-Type: application/json
X-Webhook-Id: webhook-id-uuid
X-Webhook-Delivery: delivery-uuid
X-Webhook-Event: user.registered
X-Webhook-Signature: sha256=abc123...
```

```json
{
  "type": "user.registered",
  "timestamp": "2026-02-16T12:00:00.000Z",
  "payload": {
    "userId": "user-uuid"
  }
}
```

Verify the signature using HMAC-SHA256 with your `secret`.

**Available event types**:

| Event | Trigger |
|-------|---------|
| `user.registered` | New user created |
| `user.deleted` | User account deleted |
| `user.updated` | User profile updated |
| `login.success` | Successful login |
| `login.failed` | Failed login attempt |
| `logout` | User logged out |
| `password.changed` | Password updated |
| `password.reset` | Password reset completed |
| `email.verified` | Email verified |
| `mfa.enabled` | MFA enabled |
| `mfa.disabled` | MFA disabled |
| `api_key.created` | API key created |
| `api_key.revoked` | API key revoked |
| `account.locked` | Account locked (too many failures) |
| `account.unlocked` | Account unlocked |

---

### `GET /api/v1/webhooks`

List all registered webhooks.

**Auth**: `Bearer <accessToken>` (admin role required)

**Response** `200`: Array of webhook objects.

---

### `DELETE /api/v1/webhooks/:id`

Remove a webhook subscription.

**Auth**: `Bearer <accessToken>` (admin role required)

**Response** `204`: No content

---

## Server-Sent Events (SSE)

### `GET /api/v1/events/stream`

Subscribe to real-time domain events via Server-Sent Events.

**Auth**: `Bearer <accessToken>` via `Authorization` header or `?token=<accessToken>` query parameter.

**Query Parameters**:

| Parameter | Description |
|-----------|-------------|
| `token` | Access token (alternative to `Authorization` header) |
| `events` | Comma-separated event types to filter (optional — receive all if omitted) |

**Example**:

```bash
curl -N http://localhost:3000/api/v1/events/stream?token=<accessToken>&events=user.registered,login.failed
```

**Response**: `text/event-stream`

```
event: user.registered
id: evt-550e8400
data: {"type":"user.registered","timestamp":"2026-02-16T12:00:00.000Z","payload":{"userId":"user-uuid"}}

:heartbeat

event: login.failed
id: evt-660f9511
data: {"type":"login.failed","timestamp":"2026-02-16T12:01:00.000Z","payload":{"email":"attacker@example.com"}}
```

- Heartbeat comment (`:heartbeat`) sent every 30 seconds to keep the connection alive
- Each event includes `event`, `id`, and `data` fields per [SSE spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

## WebSocket

### `WS /ws`

Real-time bidirectional communication via native Bun WebSocket.

**Connection**:

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");
```

**Protocol** — all messages are JSON:

#### Client → Server

**Authenticate** (required first message):

```json
{ "type": "auth", "token": "<accessToken>" }
```

**Subscribe to events**:

```json
{ "type": "subscribe", "events": ["user.registered", "login.failed"] }
```

**Unsubscribe**:

```json
{ "type": "unsubscribe", "events": ["login.failed"] }
```

**Ping**:

```json
{ "type": "ping" }
```

#### Server → Client

**Auth result**:

```json
{ "type": "auth", "ok": true, "userId": "user-uuid" }
```

**Subscription confirmation**:

```json
{ "type": "subscribed", "events": ["user.registered", "login.failed"] }
```

**Event**:

```json
{
  "type": "event",
  "event": {
    "type": "user.registered",
    "timestamp": "2026-02-16T12:00:00.000Z",
    "payload": { "userId": "user-uuid" }
  }
}
```

**Pong**:

```json
{ "type": "pong" }
```

**Error**:

```json
{ "type": "error", "message": "Authentication required" }
```

---

## API Versioning

All `/api/v1/` endpoints are also available under `/api/v2/`. The v2 prefix is normalised internally — both versions call the same handlers.

### Version Headers

**v1 responses** include deprecation headers:

```
API-Version: v1
Deprecation: true
Sunset: 2025-12-31
Link: </api/v2/auth/register>; rel="successor-version"
```

**v2 responses**:

```
API-Version: v2
```

### Conditional Requests (ETag)

All `GET` responses that return `200` include an `ETag` header (MD5 of the response body).

Send the ETag value in subsequent requests:

```bash
curl http://localhost:3000/docs \
  -H "If-None-Match: \"abc123\""
```

If the content hasn't changed, the server returns `304 Not Modified` with no body.

---

## Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request or business rule violation |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `VALIDATION` | 422 | Request body validation failed |
| `RATE_LIMITED` | 429 | Too many requests — wait and retry |
| `INTERNAL` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service degraded or circuit breaker open |
| `TIMEOUT` | 504 | Upstream operation timed out |
