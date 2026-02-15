# Error Handling

onlyApi uses a `Result<T, E>` monad for all fallible operations. No exceptions are thrown in application code — errors are explicit return values enforced by the type system.

---

## Result Type

```typescript
type Result<T, E = AppError> = Ok<T> | Err<E>;

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
```

### Creating Results

```typescript
import { ok, err } from "@core/types/result";

// Success
const user = ok({ id: "123", email: "user@example.com" });

// Failure
const error = err(AppError.notFound("User"));
```

### Checking Results

```typescript
const result = await userRepository.findById(id);

if (result.ok) {
  // result.value is the user
  console.log(result.value.email);
} else {
  // result.error is an AppError
  console.log(result.error.code, result.error.message);
}
```

### Combinators

| Method | Signature | Description |
|--------|-----------|-------------|
| `map` | `map<U>(fn: (value: T) => U): Result<U, E>` | Transform the success value |
| `flatMap` | `flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>` | Chain fallible operations |
| `unwrapOr` | `unwrapOr(defaultValue: T): T` | Extract value with fallback |

### Try/Catch Wrappers

For interacting with code that throws:

```typescript
import { tryCatch, tryCatchAsync } from "@core/types/result";

// Synchronous
const result = tryCatch(() => JSON.parse(text));

// Asynchronous
const result = await tryCatchAsync(() => fetch(url));
```

Both capture thrown errors and wrap them in `Err<AppError>`.

---

## AppError

The structured error type used throughout the application.

### Structure

```typescript
interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
  readonly cause?: unknown;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request or business rule violation |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication credentials |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Resource already exists (e.g., duplicate email) |
| `VALIDATION` | 422 | Request body failed schema validation |
| `RATE_LIMITED` | 429 | Too many requests — retry after delay |
| `INTERNAL` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service degraded or circuit breaker open |
| `TIMEOUT` | 504 | Upstream operation timed out |

### Factory Functions

```typescript
import { AppError } from "@core/errors";

AppError.badRequest("Invalid date format");
AppError.unauthorized("Token has expired");
AppError.forbidden("Admin access required");
AppError.notFound("User");              // "User not found"
AppError.conflict("Email already registered");
AppError.rateLimited("Too many login attempts");
AppError.validation([
  { field: "email", message: "Invalid email format" },
  { field: "password", message: "Must be at least 8 characters" }
]);
AppError.internal("Database connection failed", originalError);
```

---

## HTTP Error Responses

### Standard Error

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
X-Request-Id: abc-123

{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "requestId": "abc-123"
}
```

### Validation Error

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Request-Id: abc-123

{
  "error": {
    "code": "VALIDATION",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "password", "message": "Must be at least 8 characters" }
    ]
  },
  "requestId": "abc-123"
}
```

### Rate Limited Error

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 45
X-Request-Id: abc-123

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  },
  "requestId": "abc-123"
}
```

### Internal Error

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json
X-Request-Id: abc-123

{
  "error": {
    "code": "INTERNAL",
    "message": "An unexpected error occurred"
  },
  "requestId": "abc-123"
}
```

> The `cause` (original error, stack trace) is **never** sent to the client. It is logged server-side with the `requestId` for debugging.

---

## Error Handling in Handlers

Every handler follows this pattern:

```typescript
async function handler(req: Request, ctx: RequestContext): Promise<Response> {
  // 1. Parse and validate input
  const body = await req.json();
  const validation = validateBody(schema, body);
  if (!validation.ok) {
    return errorResponse(validation.error, ctx.requestId);
  }

  // 2. Call the service
  const result = await service.doSomething(validation.value);
  if (!result.ok) {
    return errorResponse(result.error, ctx.requestId);
  }

  // 3. Return success
  return jsonResponse(result.value);
}
```

No try/catch blocks. No thrown exceptions. The flow is linear and type-safe.

---

## Error Handling in Services

Services compose results using the monadic pattern:

```typescript
async function register(dto: RegisterDto): Promise<Result<TokenPair>> {
  // Validate password policy
  const policyResult = passwordPolicy.validate(dto.password);
  if (!policyResult.ok) return policyResult;

  // Check for existing user
  const existing = await userRepo.findByEmail(dto.email);
  if (existing.ok) return err(AppError.conflict("Email already registered"));

  // Hash password
  const hashResult = await hasher.hash(dto.password);
  if (!hashResult.ok) return hashResult;

  // Create user
  const userResult = await userRepo.create({ ... });
  if (!userResult.ok) return userResult;

  // Issue tokens
  return tokenService.sign({ sub: userResult.value.id, ... });
}
```

Each step that can fail returns a `Result`. Errors short-circuit the function and propagate to the handler, which converts them to HTTP responses.

---

## 404 — Route Not Found

Unmatched routes return:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found"
  },
  "requestId": "abc-123"
}
```

---

## Unhandled Errors

If an error escapes all Result handling (e.g., a Bun runtime error), the server catches it at the top level and returns a generic `500`:

```json
{
  "error": {
    "code": "INTERNAL",
    "message": "An unexpected error occurred"
  },
  "requestId": "abc-123"
}
```

The actual error is logged with full details and the request ID for correlation.
