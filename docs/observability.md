# Observability

onlyApi includes built-in observability features: structured logging, Prometheus metrics, distributed tracing, audit logging, and alerting. All implemented with zero external dependencies.

---

## Logging

### Configuration

```env
LOG_LEVEL=info       # debug | info | warn | error | fatal
LOG_FORMAT=pretty    # pretty | json
```

### Log Levels

| Level | Numeric | Output | Use Case |
|-------|---------|--------|----------|
| `debug` | 0 | stdout | Development diagnostics |
| `info` | 1 | stdout | Normal operations |
| `warn` | 2 | stderr | Recoverable issues |
| `error` | 3 | stderr | Failed operations |
| `fatal` | 4 | stderr | Unrecoverable failures (process should exit) |

### Pretty Format (Development)

```
12:34:56 INFO  Server listening on http://0.0.0.0:3000
12:34:57 DEBUG GET /health 200 0.4ms  [req=abc-123]
12:34:58 WARN  Rate limit exceeded  [ip=192.168.1.1]
```

ANSI-coloured output with timestamps. Each level has a distinct colour.

### JSON Format (Production)

```json
{"level":"info","timestamp":"2026-02-16T12:34:56.789Z","msg":"Server listening on http://0.0.0.0:3000","pid":1234}
{"level":"debug","timestamp":"2026-02-16T12:34:57.123Z","msg":"GET /health 200 0.4ms","requestId":"abc-123"}
{"level":"warn","timestamp":"2026-02-16T12:34:58.456Z","msg":"Rate limit exceeded","ip":"192.168.1.1"}
```

Structured JSON for ingestion by Datadog, ELK, Splunk, CloudWatch, or any log aggregator.

### Batched Async Logging

In production (`NODE_ENV=production`), log writes are **batched** and flushed every **100ms** in a single `write()` syscall. This minimises I/O overhead on the hot path.

In development, logs are written immediately for real-time debugging.

### Child Loggers

Each request creates a **child logger** with the request ID bound as metadata:

```json
{"level":"info","msg":"User logged in","requestId":"abc-123","userId":"user-uuid"}
```

All log calls within that request automatically include the `requestId` — no manual passing required.

---

## Prometheus Metrics

### Endpoint

```
GET /metrics
```

Returns metrics in Prometheus text exposition format v0.0.4.

### Available Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `http_requests_total` | `method`, `path`, `status` | Total HTTP requests processed |
| `http_errors_total` | `method`, `path`, `status` | Total HTTP errors (4xx + 5xx) |
| `alerts_sent_total` | `level` | Total alert notifications sent |

#### Histograms

| Metric | Labels | Buckets (ms) | Description |
|--------|--------|------|-------------|
| `http_request_duration_ms` | `method`, `path` | 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000 | Request latency distribution |

#### Gauges

| Metric | Description |
|--------|-------------|
| `http_active_connections` | Current in-flight requests |
| `circuit_breaker_state` | 0 = CLOSED, 1 = OPEN, 2 = HALF_OPEN |

### Example Output

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/health",status="200"} 1523
http_requests_total{method="POST",path="/api/v1/auth/login",status="200"} 42
http_requests_total{method="POST",path="/api/v1/auth/login",status="401"} 7

# HELP http_request_duration_ms HTTP request latency in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{method="GET",path="/health",le="1"} 1500
http_request_duration_ms_bucket{method="GET",path="/health",le="5"} 1523
http_request_duration_ms_bucket{method="GET",path="/health",le="+Inf"} 1523
http_request_duration_ms_sum{method="GET",path="/health"} 456.7
http_request_duration_ms_count{method="GET",path="/health"} 1523

# HELP http_active_connections Currently active connections
# TYPE http_active_connections gauge
http_active_connections 3
```

### Prometheus Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "onlyapi"
    scrape_interval: 15s
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: /metrics
```

### Grafana Dashboard

Query examples for Grafana:

```promql
# Request rate (per second)
rate(http_requests_total[5m])

# Error rate
sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))

# p99 latency
histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))

# Active connections
http_active_connections
```

---

## Distributed Tracing

### W3C Trace Context

Every request carries a W3C `traceparent` header for distributed tracing:

```
traceparent: 00-<32-hex-trace-id>-<16-hex-span-id>-01
```

**Propagation rules**:

1. If the incoming request includes `traceparent`, the trace ID is preserved and a new span ID is generated
2. If no `traceparent` is present, both trace ID and span ID are generated
3. The `traceparent` header is always included in the response

### Integration with Tracers

The trace context is compatible with:

- OpenTelemetry
- Jaeger
- Zipkin
- Datadog APT
- AWS X-Ray
- Google Cloud Trace

### Request Context

The trace information is available in the `RequestContext`:

```typescript
interface TraceContext {
  traceId: string;   // 128-bit hex
  spanId: string;    // 64-bit hex
  sampled: boolean;
}
```

---

## Audit Log

An append-only record of security-relevant actions.

### Recorded Actions

| Action | Trigger |
|--------|---------|
| `USER_REGISTERED` | User created an account |
| `USER_LOGGED_IN` | Successful login |
| `USER_LOGGED_OUT` | User logged out |
| `USER_LOGIN_FAILED` | Failed login attempt |
| `USER_UPDATED` | Profile updated |
| `USER_DELETED` | Account deleted |
| `USER_BANNED` | Admin banned a user |
| `USER_UNBANNED` | Admin unbanned a user |
| `USER_ROLE_CHANGED` | Admin changed user's role |
| `TOKEN_REFRESHED` | Token refreshed |
| `ACCOUNT_LOCKED` | Account locked due to failed attempts |

### Entry Structure

```json
{
  "id": "audit-uuid",
  "action": "USER_LOGGED_IN",
  "userId": "actor-uuid",
  "targetId": null,
  "ip": "192.168.1.1",
  "metadata": {},
  "createdAt": 1708099200000
}
```

### Storage

Audit logs are stored in the `audit_log` table (SQLite or PostgreSQL). They are **append-only** — no update or delete operations are supported.

### Querying

The audit log supports programmatic querying with filters:

- By user ID
- By action type
- By date range
- Pagination

---

## Health Checks

### Shallow Health Check

```
GET /health
```

Returns immediately with a pre-serialised response. No database queries, no computation. Use for load balancer probes.

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

### Deep Readiness Check

```
GET /readiness
```

Tests actual service connectivity:

- **Memory check**: Reports heap usage and warns if high
- **Circuit breaker**: Reports breaker state for external dependencies

```json
{
  "data": {
    "status": "ok",
    "version": "1.5.0",
    "uptime": 3600.123,
    "timestamp": "2026-02-16T12:00:00.000Z",
    "checks": {
      "memory": {
        "status": "ok",
        "heapUsed": 45678912,
        "heapTotal": 67108864
      },
      "circuitBreaker": {
        "status": "ok",
        "state": "CLOSED"
      }
    }
  }
}
```

**Status values**:

| Status | Meaning | HTTP |
|--------|---------|------|
| `ok` | All systems operational | 200 |
| `degraded` | Non-critical issue (e.g., high memory, circuit half-open) | 200 |
| `down` | Critical failure (e.g., circuit breaker open) | 503 |

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /readiness
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15
```

---

## Circuit Breaker

Protects downstream services from cascading failures.

### Configuration

```env
CB_FAILURE_THRESHOLD=5          # Failures to trip the breaker
CB_RESET_TIMEOUT_MS=30000       # 30s before retry (OPEN → HALF_OPEN)
CB_HALF_OPEN_SUCCESS_THRESHOLD=2  # Successes to reset (HALF_OPEN → CLOSED)
```

### State Machine

```
        failure ≥ threshold
CLOSED ──────────────────────► OPEN
   ▲                             │
   │                             │ timeout elapsed
   │                             ▼
   │  success ≥ threshold    HALF_OPEN
   └─────────────────────────────┘
              failure
              ─────► OPEN
```

| State | Behaviour |
|-------|-----------|
| **CLOSED** | Requests pass through. Failures are counted. |
| **OPEN** | Requests fail immediately with `503 Service Unavailable`. No calls to downstream. |
| **HALF_OPEN** | Limited requests pass through. Successes close the circuit; failures re-open it. |

---

## Alerting

### Configuration

```env
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxx
ALERT_TIMEOUT_MS=5000
```

### Alert Levels

| Level | Trigger |
|-------|---------|
| `WARNING` | Circuit breaker half-open, high memory usage |
| `CRITICAL` | Circuit breaker open, unhandled rejection |
| `RESOLVED` | Circuit breaker closed again |

### Alert Payload

Alerts are delivered via HTTP POST to the configured webhook URL:

```json
{
  "level": "CRITICAL",
  "title": "Circuit Breaker Open",
  "message": "Database circuit breaker opened after 5 consecutive failures",
  "timestamp": "2026-02-16T12:00:00.000Z",
  "service": "onlyapi",
  "metadata": {
    "breakerName": "database",
    "failureCount": 5
  }
}
```

### Retry

Alert delivery uses exponential backoff (3 attempts, 1s → 2s → 4s) to handle transient webhook failures.

---

## Retry Policy

For resilient external calls, onlyApi includes a configurable retry policy:

| Parameter | Description |
|-----------|-------------|
| `maxRetries` | Maximum retry attempts |
| `initialDelay` | Starting backoff delay (ms) |
| `maxDelay` | Maximum backoff cap (ms) |
| `backoffMultiplier` | Multiplicative factor per retry |
| `jitter` | Randomised delay variance to prevent thundering herd |
| `retryable` | Predicate function — determines if error is retryable |
| `onRetry` | Callback invoked on each retry (for logging) |
