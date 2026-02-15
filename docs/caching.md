# Caching

onlyApi includes a unified cache layer with two backends — in-memory (default) and Redis (zero-dependency).

---

## Cache Interface

Both backends implement the same `Cache` port:

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get(key: string): Promise<string \| null>` | Retrieve a value by key |
| `set` | `set(key: string, value: string, ttlMs?: number): Promise<void>` | Store a value with optional TTL |
| `del` | `del(key: string): Promise<void>` | Delete a key |
| `has` | `has(key: string): Promise<boolean>` | Check if a key exists |
| `incr` | `incr(key: string, amount?: number): Promise<number>` | Increment a numeric value atomically |
| `delPattern` | `delPattern(pattern: string): Promise<void>` | Delete all keys matching a pattern |
| `close` | `close(): Promise<void>` | Close the connection (graceful shutdown) |

---

## In-Memory Cache (Default)

Enabled when `REDIS_ENABLED=false` (default).

### How It Works

- Backed by a JavaScript `Map<string, { value: string; expiresAt: number | null }>`
- Entries with TTL are lazily expired on access (checked on `get`, `has`, `incr`)
- Automatic prune interval removes all expired entries periodically
- Pattern deletion uses regex matching against keys

### Best For

- Single-process deployments
- Development and testing
- Low-traffic applications

### Limitations

- Not shared between cluster workers (each worker has its own cache)
- Lost on process restart
- Memory-bound — large caches consume heap

---

## Redis Cache

Enabled when `REDIS_ENABLED=true`.

### Configuration

```env
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=optional-secret
REDIS_DB=0
```

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ENABLED` | `false` | Enable Redis |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | AUTH password (optional) |
| `REDIS_DB` | `0` | Database index for SELECT |

### Zero-Dependency Implementation

The Redis client is built from scratch using the **RESP (Redis Serialization Protocol)** over raw TCP via `Bun.connect()`. No `ioredis`, no `redis`, no npm packages.

Supported Redis commands:

| Command | Usage |
|---------|-------|
| `AUTH` | Authentication (if password set) |
| `SELECT` | Database selection |
| `GET` | Retrieve value |
| `SET` with `PX` | Store with millisecond TTL |
| `DEL` | Delete key |
| `EXISTS` | Check existence |
| `INCRBY` | Atomic increment |
| `KEYS` | Pattern matching (for `delPattern`) |
| `QUIT` | Graceful disconnect |

### Best For

- Multi-process cluster deployments (shared state)
- Production environments
- High-traffic applications
- Deployments where cache state must survive process restarts

### Docker Compose Example

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redis-secret
    ports:
      - "6379:6379"

  api:
    build: .
    environment:
      REDIS_ENABLED: "true"
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: redis-secret
    depends_on:
      - redis
```

---

## Where Caching Is Used

The cache layer is used by several subsystems:

| Component | Cache Usage |
|-----------|-------------|
| Rate Limiter | Request counts per IP (when Redis-backed) |
| Token Blacklist | Quick lookup for revoked tokens (optional, supplements DB) |
| Account Lockout | Failed attempt counters |
| Health Check | Cached health status to avoid repeated DB pings |

---

## Graceful Shutdown

On `SIGINT` or `SIGTERM`, the cache's `close()` method is called:

- **In-memory**: Clears the Map and stops the prune interval
- **Redis**: Sends `QUIT` command and closes the TCP connection
