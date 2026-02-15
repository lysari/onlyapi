# Real-time Communication

onlyApi supports two real-time communication channels: **WebSocket** and **Server-Sent Events (SSE)**. Both are built on Bun's native primitives — no Socket.IO, no external libraries.

---

## Domain Events

All real-time channels deliver **domain events** — structured messages emitted when something significant happens in the system.

### Event Types

| Event | Payload | Trigger |
|-------|---------|---------|
| `user.registered` | `{ userId }` | New user created |
| `user.deleted` | `{ userId }` | User account deleted |
| `user.updated` | `{ userId, fields }` | User profile updated |
| `login.success` | `{ userId, email }` | Successful login |
| `login.failed` | `{ email }` | Failed login attempt |
| `logout` | `{ userId }` | User logged out |
| `password.changed` | `{ userId }` | Password updated |
| `password.reset` | `{ userId }` | Password reset completed |
| `email.verified` | `{ userId }` | Email address verified |
| `mfa.enabled` | `{ userId }` | MFA turned on |
| `mfa.disabled` | `{ userId }` | MFA turned off |
| `api_key.created` | `{ userId, keyId }` | API key created |
| `api_key.revoked` | `{ userId, keyId }` | API key revoked |
| `account.locked` | `{ email }` | Account locked (too many failures) |
| `account.unlocked` | `{ email }` | Account unlocked |

### Event Structure

```json
{
  "id": "evt-550e8400-e29b-41d4-a716-446655440000",
  "type": "user.registered",
  "timestamp": "2026-02-16T12:00:00.000Z",
  "payload": {
    "userId": "user-uuid"
  }
}
```

---

## Event Bus

The in-memory event bus is the backbone of the real-time system. All subsystems publish events to it, and all consumers subscribe through it.

### Subscriptions

```
Event Bus
  ├── WebSocket Manager  → forwards to connected clients
  ├── SSE Handler        → forwards to SSE streams
  ├── Webhook Dispatcher → sends HTTP POST to webhook URLs
  ├── Audit Log          → records events to the database
  └── Custom handlers    → your application logic
```

### Subscription Types

- **Typed subscription**: `subscribe("user.registered", handler)` — only receives events of that type
- **Wildcard subscription**: `subscribeAll(handler)` — receives every event

---

## WebSocket

### Endpoint

```
WS /ws
```

Uses Bun's native WebSocket implementation for maximum performance.

### Connection

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // Step 1: Authenticate
  ws.send(JSON.stringify({
    type: "auth",
    token: "your-jwt-access-token"
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg);
};
```

### Protocol

All messages are JSON. The client must authenticate before subscribing.

#### Client → Server Messages

**Authenticate** (required first):

```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Subscribe to events**:

```json
{
  "type": "subscribe",
  "events": ["user.registered", "login.failed"]
}
```

**Unsubscribe**:

```json
{
  "type": "unsubscribe",
  "events": ["login.failed"]
}
```

**Ping** (keep-alive):

```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**Authentication result**:

```json
{ "type": "auth", "ok": true, "userId": "user-uuid" }
```

```json
{ "type": "auth", "ok": false }
```

**Subscription confirmation**:

```json
{ "type": "subscribed", "events": ["user.registered", "login.failed"] }
```

**Domain event**:

```json
{
  "type": "event",
  "event": {
    "id": "evt-uuid",
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

### Complete Client Example

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({ type: "auth", token: accessToken }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "auth":
      if (msg.ok) {
        console.log("Authenticated as", msg.userId);
        // Subscribe to events
        ws.send(JSON.stringify({
          type: "subscribe",
          events: ["user.registered", "login.failed", "account.locked"]
        }));
      } else {
        console.error("Auth failed");
      }
      break;

    case "subscribed":
      console.log("Subscribed to:", msg.events);
      break;

    case "event":
      console.log("Event:", msg.event.type, msg.event.payload);
      break;

    case "pong":
      // Keep-alive response
      break;

    case "error":
      console.error("Error:", msg.message);
      break;
  }
};

// Periodic keep-alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
  }
}, 30000);
```

---

## Server-Sent Events (SSE)

### Endpoint

```
GET /api/v1/events/stream
```

### Authentication

**Via header**:

```bash
curl -N http://localhost:3000/api/v1/events/stream \
  -H "Authorization: Bearer <accessToken>"
```

**Via query parameter**:

```bash
curl -N "http://localhost:3000/api/v1/events/stream?token=<accessToken>"
```

The query parameter option makes SSE usable from `EventSource` in browsers, which doesn't support custom headers.

### Event Filtering

Subscribe to specific event types with the `events` query parameter:

```bash
curl -N "http://localhost:3000/api/v1/events/stream?token=<token>&events=user.registered,login.failed"
```

Omit `events` to receive all events.

### Response Format

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

```
event: user.registered
id: evt-550e8400
data: {"type":"user.registered","timestamp":"2026-02-16T12:00:00.000Z","payload":{"userId":"user-uuid"}}

:heartbeat

event: login.failed
id: evt-660f9511
data: {"type":"login.failed","timestamp":"2026-02-16T12:01:00.000Z","payload":{"email":"attacker@example.com"}}
```

### Heartbeat

A `:heartbeat` comment is sent every **30 seconds** to keep the connection alive and prevent proxy/load balancer timeouts.

### Browser Client Example

```javascript
const eventSource = new EventSource(
  `http://localhost:3000/api/v1/events/stream?token=${accessToken}&events=user.registered`
);

eventSource.addEventListener("user.registered", (event) => {
  const data = JSON.parse(event.data);
  console.log("New user:", data.payload.userId);
});

eventSource.onerror = (error) => {
  console.error("SSE connection error:", error);
  // EventSource auto-reconnects
};
```

---

## WebSocket vs SSE — When to Use Which

| Feature | WebSocket | SSE |
|---------|-----------|-----|
| Direction | Bidirectional | Server → Client only |
| Protocol | Binary + Text | Text only |
| Auto-reconnect | No (manual) | Yes (built into `EventSource`) |
| Browser headers | No custom headers | No custom headers (use `?token=`) |
| Firewall-friendly | Sometimes blocked | Always works (plain HTTP) |
| Best for | Interactive apps, chat, gaming | Dashboards, notifications, logs |

---

## Background Job Queue

For asynchronous event processing (email sending, webhook delivery, etc.), onlyApi includes an in-memory job queue.

### Features

- Async job submission with typed payloads
- Registered handler functions per job type
- Exponential backoff retry on failure
- Dead letter queue for permanently failed jobs
- Job status tracking (`pending`, `processing`, `completed`, `failed`, `dead`)

### Usage

Jobs are submitted internally by the application services. For example, webhook delivery and email sending are dispatched as background jobs.

### Statistics

Job queue statistics are available programmatically:

```json
{
  "pending": 3,
  "processing": 1,
  "completed": 142,
  "failed": 0,
  "dead": 0
}
```
