# Authentication

onlyApi provides a comprehensive authentication system built entirely on Web Crypto API and Bun builtins — zero external dependencies.

---

## Overview

| Method | Use Case |
|--------|----------|
| JWT (access + refresh) | Primary authentication for end users |
| MFA / TOTP | Second factor for sensitive accounts |
| OAuth2 (Google, GitHub) | Social login / SSO |
| API Keys | Service-to-service communication |

---

## JWT Authentication

### How It Works

1. User registers or logs in → receives an **access token** and a **refresh token**
2. Access token is sent with every request in the `Authorization: Bearer <token>` header
3. When the access token expires, the client uses the refresh token to get a new pair
4. On logout, both tokens are blacklisted

### Token Structure

**Access token** payload:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "user",
  "type": "access",
  "iat": 1708099200,
  "exp": 1708100100
}
```

**Refresh token** payload:

```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "familyId": "family-uuid",
  "iat": 1708099200,
  "exp": 1708704000
}
```

### Token Lifetimes

| Token | Default TTL | Config Variable |
|-------|-------------|-----------------|
| Access | 15 minutes | `JWT_EXPIRES_IN` |
| Refresh | 7 days | `JWT_REFRESH_EXPIRES_IN` |

### Complete Flow

```
Client                                    Server
  │                                         │
  ├──POST /api/v1/auth/register────────────►│
  │        { email, password }              │
  │◄───────────────────────────────────────┤
  │  { accessToken, refreshToken }          │
  │                                         │
  ├──GET /api/v1/users/me──────────────────►│
  │  Authorization: Bearer <accessToken>    │
  │◄───────────────────────────────────────┤
  │  { id, email, role, ... }               │
  │                                         │
  │  ... access token expires ...           │
  │                                         │
  ├──POST /api/v1/auth/refresh─────────────►│
  │        { refreshToken }                 │
  │◄───────────────────────────────────────┤
  │  { accessToken, refreshToken }  (new)   │
  │                                         │
  ├──POST /api/v1/auth/logout──────────────►│
  │  Authorization: Bearer <accessToken>    │
  │        { refreshToken }                 │
  │◄───────────────────────────────────────┤
  │  204 No Content                         │
```

---

## Refresh Token Rotation

onlyApi uses **one-time-use refresh tokens** with **family-based reuse detection**.

### How It Works

1. Each refresh token belongs to a **family** (identified by `familyId`)
2. When a token is refreshed, the old one is marked as used and a new one is issued
3. If a previously used token is submitted again (replay attack), the **entire family is revoked** — all sessions for that user are invalidated
4. This protects against stolen refresh tokens

### Example: Normal Rotation

```
Login       → RT₁ (family: F1)
Refresh RT₁ → RT₂ (family: F1), RT₁ marked used
Refresh RT₂ → RT₃ (family: F1), RT₂ marked used
```

### Example: Theft Detection

```
Login       → RT₁ (family: F1)
Refresh RT₁ → RT₂ (family: F1)   ← legitimate client
Refresh RT₁ → ERROR               ← attacker replays RT₁
                                     ALL family F1 tokens revoked
```

---

## Token Blacklist

When a user logs out, both the access token and refresh token are added to a blacklist (stored in SQLite/Postgres). Blacklisted tokens are rejected even if they haven't expired.

The blacklist is automatically pruned every 10 minutes — expired entries are removed to keep the table small.

---

## Multi-Factor Authentication (MFA)

### TOTP (Time-based One-Time Password)

Implements [RFC 6238](https://tools.ietf.org/html/rfc6238) — compatible with:

- Google Authenticator
- Authy
- Microsoft Authenticator
- 1Password
- Any standard TOTP app

### Setup Flow

```
1. POST /api/v1/auth/mfa/setup
   → { secret, uri }
   
2. Display URI as QR code (user scans with authenticator app)

3. POST /api/v1/auth/mfa/enable
   { secret, code: "123456" }  ← from authenticator
   → MFA enabled

4. Future logins return { mfaRequired: true, mfaToken }

5. POST /api/v1/auth/mfa/verify
   { mfaToken, code: "654321" }
   → { accessToken, refreshToken }
```

### TOTP Parameters

| Parameter | Value |
|-----------|-------|
| Algorithm | SHA-1 |
| Digits | 6 |
| Period | 30 seconds |
| Window | ±1 (accepts codes from adjacent periods) |
| Encoding | Base32 |

### Login with MFA

```
Client                                    Server
  │                                         │
  ├──POST /api/v1/auth/login───────────────►│
  │  { email, password }                    │
  │◄───────────────────────────────────────┤
  │  { mfaRequired: true, mfaToken }       │
  │                                         │
  ├──POST /api/v1/auth/mfa/verify──────────►│
  │  { mfaToken, code: "123456" }           │
  │◄───────────────────────────────────────┤
  │  { accessToken, refreshToken }          │
```

---

## OAuth2 / SSO

### Supported Providers

| Provider | Config Variables |
|----------|-----------------|
| Google | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` |
| GitHub | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` |

Providers are only enabled if both client ID and secret are set.

### Flow

```
Client                     Server                    Provider
  │                          │                          │
  ├──GET /auth/oauth/google─►│                          │
  │                          ├──302 Redirect───────────►│
  │                          │  (authorization URL)     │
  │◄─────────────────────────┤                          │
  │  (user sees consent)     │                          │
  │                          │                          │
  │  (user grants access)    │                          │
  │──────────────────────────┼──callback with code──────►
  │                          │                          │
  ├──POST /auth/oauth/google/callback──────────────────►│
  │  { code, state }         │                          │
  │                          ├──exchange code for info──►│
  │                          │◄────────────────────────┤
  │◄─────────────────────────┤                          │
  │  { accessToken,          │                          │
  │    refreshToken }        │                          │
```

### Account Linking

- If the OAuth email matches an existing local user, the OAuth account is **linked** to that user
- If no local user exists, a new user is **created** with `emailVerified: true`
- Subsequent OAuth logins for the same provider skip registration

---

## API Key Authentication

API keys are designed for machine-to-machine communication (CI pipelines, microservices, scripts).

### Usage

Send the key in the `X-API-Key` header:

```bash
curl http://localhost:3000/api/v1/users/me \
  -H "X-API-Key: oapi_abc123...xyz"
```

### Key Format

API keys are prefixed with `oapi_` followed by a cryptographically random string. The raw key is only shown once at creation — only a SHA-256 hash is stored.

### Scopes

Each API key has a list of scopes that define its permissions:

```json
{
  "name": "CI Pipeline",
  "scopes": ["read:users", "write:users"],
  "expiresInDays": 90
}
```

### Key Lifecycle

1. **Create**: `POST /api/v1/api-keys` → raw key returned once
2. **Use**: `X-API-Key: oapi_...` → verified on every request, `lastUsedAt` updated
3. **List**: `GET /api/v1/api-keys` → all keys (without raw values)
4. **Revoke**: `DELETE /api/v1/api-keys/:id` → immediately invalidated

---

## Account Lockout

After a configurable number of consecutive failed login attempts, the account is temporarily locked.

| Config | Default | Description |
|--------|---------|-------------|
| `LOCKOUT_MAX_ATTEMPTS` | 5 | Failures before lockout |
| `LOCKOUT_DURATION_MS` | 900000 | Lock duration (15 min) |

**Behaviour**:

1. Failed login → increment counter
2. Counter reaches max → account locked, returns `429 Rate Limited` with `Retry-After`
3. After lockout duration → counter resets
4. Successful login → counter resets immediately

---

## Password Policy

Passwords are validated against a configurable policy on registration, update, and reset.

### Rules

| Rule | Config | Default |
|------|--------|---------|
| Minimum length | `PASSWORD_MIN_LENGTH` | 8 |
| Uppercase required | `PASSWORD_REQUIRE_UPPERCASE` | `true` |
| Lowercase required | `PASSWORD_REQUIRE_LOWERCASE` | `true` |
| Digit required | `PASSWORD_REQUIRE_DIGIT` | `true` |
| Special char required | `PASSWORD_REQUIRE_SPECIAL` | `false` |
| History check | `PASSWORD_HISTORY_COUNT` | 5 |
| Expiry | `PASSWORD_MAX_AGE_DAYS` | 0 (disabled) |

### History

The last N password hashes are stored. When a user changes their password, the new password is checked against all stored hashes to prevent reuse.

### Expiry

When `PASSWORD_MAX_AGE_DAYS` is set to a non-zero value, login checks whether the password has expired. If expired, the server returns `400 BAD_REQUEST` with a message indicating the user must reset their password.

---

## Email Verification

After registration, a verification token is generated (SHA-256 hashed, 24-hour TTL). In a production setup, this token would be sent via email.

### Flow

```
1. POST /api/v1/auth/register → token generated internally
2. POST /api/v1/auth/resend-verification → new token (invalidates previous)
3. POST /api/v1/auth/verify-email { token } → emailVerified = true
```

---

## Password Reset

### Flow

```
1. POST /api/v1/auth/forgot-password { email }
   → token generated (1-hour TTL)
   → always returns success (prevents email enumeration)

2. POST /api/v1/auth/reset-password { token, password }
   → validates password policy + history
   → updates password hash
   → revokes all refresh token families
```

After a password reset, **all existing sessions are invalidated** — the user must log in again.
