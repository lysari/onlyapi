# Events & Webhooks

onlyApi includes a complete event system: domain events, an in-memory event bus, webhook delivery with signatures, and a background job queue.

---

## Domain Events

Domain events are emitted automatically when significant actions occur in the system. They are the foundation for all real-time features (WebSocket, SSE, webhooks).

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `user.registered` | User creates an account | `{ userId }` |
| `user.deleted` | User deletes their account | `{ userId }` |
| `user.updated` | User updates their profile | `{ userId, fields }` |
| `login.success` | Successful authentication | `{ userId, email }` |
| `login.failed` | Failed login attempt | `{ email }` |
| `logout` | User logs out | `{ userId }` |
| `password.changed` | Password updated | `{ userId }` |
| `password.reset` | Password reset completed | `{ userId }` |
| `email.verified` | Email address verified | `{ userId }` |
| `mfa.enabled` | MFA turned on | `{ userId }` |
| `mfa.disabled` | MFA turned off | `{ userId }` |
| `api_key.created` | API key created | `{ userId, keyId }` |
| `api_key.revoked` | API key revoked | `{ userId, keyId }` |
| `account.locked` | Account locked (brute force) | `{ email }` |
| `account.unlocked` | Account unlocked | `{ email }` |

### Event Structure

```typescript
interface DomainEvent {
  id: string;           // UUID v4
  type: string;         // e.g., "user.registered"
  timestamp: string;    // ISO 8601
  payload: unknown;     // Event-specific data
}
```

### Event Factory

Events are created through a factory that ensures consistent structure:

```typescript
const event = EventFactory.userRegistered({ userId: "user-uuid" });
// {
//   id: "evt-550e8400-...",
//   type: "user.registered",
//   timestamp: "2026-02-16T12:00:00.000Z",
//   payload: { userId: "user-uuid" }
// }
```

---

## Event Bus

The in-memory event bus distributes events to all subscribers.

### Subscription Types

**Type-specific subscription** — only receives events of a specific type:

```typescript
eventBus.subscribe("user.registered", async (event) => {
  console.log("New user:", event.payload.userId);
});
```

**Wildcard subscription** — receives every event:

```typescript
eventBus.subscribeAll(async (event) => {
  console.log("Event:", event.type, event.payload);
});
```

### Delivery Guarantees

- **Fire-and-forget**: Events are dispatched to all subscribers asynchronously
- **Error isolation**: If a subscriber throws, the error is caught and logged — other subscribers are not affected
- **No persistence**: Events are not stored — if a subscriber is not registered when an event fires, it misses it

### Built-in Subscribers

| Subscriber | Purpose |
|------------|---------|
| WebSocket Manager | Forwards events to connected WebSocket clients |
| SSE Handler | Pushes events to SSE streams |
| Webhook Dispatcher | Delivers events to registered webhook URLs |
| Audit Log | Records security-relevant events to the database |
| Alert Sink | Triggers alerts on critical events |

---

## Webhooks

Webhooks deliver domain events to external HTTP endpoints via POST requests.

### Creating a Webhook

```bash
curl -X POST http://localhost:3000/api/v1/webhooks \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hooks.example.com/onlyapi",
    "secret": "webhook-signing-secret-min-32-chars",
    "events": ["user.registered", "login.failed", "account.locked"]
  }'
```

### Webhook Delivery

When a matching event occurs, an HTTP POST is sent to the webhook URL:

```http
POST https://hooks.example.com/onlyapi
Content-Type: application/json
X-Webhook-Id: webhook-uuid
X-Webhook-Delivery: delivery-uuid
X-Webhook-Event: user.registered
X-Webhook-Signature: sha256=abc123def456...
```

```json
{
  "id": "evt-uuid",
  "type": "user.registered",
  "timestamp": "2026-02-16T12:00:00.000Z",
  "payload": {
    "userId": "user-uuid"
  }
}
```

### Signature Verification

Every webhook delivery is signed with HMAC-SHA256 using your `secret`. The signature is in the `X-Webhook-Signature` header.

**Verify in Node.js / Bun**:

```javascript
import { createHmac } from "crypto";

function verifyWebhookSignature(body, signature, secret) {
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// In your webhook handler:
app.post("/webhook", (req) => {
  const signature = req.headers["x-webhook-signature"];
  const body = req.body;

  if (!verifyWebhookSignature(JSON.stringify(body), signature, SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  // Process the event
  console.log("Event:", body.type, body.payload);
});
```

**Verify in Python**:

```python
import hmac
import hashlib

def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### Event Filtering

Each webhook subscription specifies which events it receives:

```json
{
  "events": ["user.registered", "login.failed"]
}
```

Only matching events are delivered. Events not in the list are silently ignored.

### Delivery Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Id` | The webhook subscription ID |
| `X-Webhook-Delivery` | Unique delivery UUID (for idempotency) |
| `X-Webhook-Event` | The event type (e.g., `user.registered`) |
| `X-Webhook-Signature` | `sha256=<HMAC-SHA256 hex digest>` |

### Delivery Recording

Each delivery is recorded with:

- Delivery UUID
- HTTP status code
- Success/failure
- Timestamp

This information is available in the webhook's delivery log.

### Managing Webhooks

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create | `/api/v1/webhooks` | POST |
| List all | `/api/v1/webhooks` | GET |
| Remove | `/api/v1/webhooks/:id` | DELETE |

All webhook management endpoints require admin access.

---

## Background Job Queue

For asynchronous processing that shouldn't block the request-response cycle.

### How It Works

1. A service submits a job to the queue
2. The queue processes jobs in FIFO order
3. If a job fails, it is retried with exponential backoff
4. After max retries, the job moves to the dead letter queue

### Job States

```
PENDING → PROCESSING → COMPLETED
                    ↓
                  FAILED → (retry) → PROCESSING
                    ↓
                  DEAD (max retries exceeded)
```

| State | Description |
|-------|-------------|
| `pending` | Waiting in queue |
| `processing` | Currently being executed |
| `completed` | Successfully processed |
| `failed` | Processing failed (will be retried) |
| `dead` | Permanently failed (moved to dead letter queue) |

### Retry Policy

- **Exponential backoff**: 1s → 2s → 4s → 8s → ...
- **Max retries**: Configurable per job type
- **Dead letter queue**: Jobs that exhaust all retries

### Job Statistics

```json
{
  "pending": 3,
  "processing": 1,
  "completed": 142,
  "failed": 0,
  "dead": 0
}
```

### Common Job Types

| Job | Description |
|-----|-------------|
| Webhook delivery | HTTP POST to webhook URLs |
| Email sending | Transactional emails (verification, reset) |
| Token pruning | Cleanup expired tokens |
| Alert delivery | Send alert notifications |

### Graceful Shutdown

On shutdown (`SIGINT`/`SIGTERM`):

1. Job queue stops accepting new jobs
2. In-progress jobs are allowed to complete
3. Pending jobs remain in the queue (lost on restart since the queue is in-memory)
