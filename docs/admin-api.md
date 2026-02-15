# Admin API

onlyApi includes a full administrative API for user management, accessible only to users with the `admin` role.

---

## Authorisation

All admin endpoints require:

1. A valid JWT access token (`Authorization: Bearer <token>`)
2. The token's `role` must be `admin`

Non-admin users receive `403 Forbidden`.

---

## Endpoints

### `GET /api/v1/admin/users`

List all users with cursor-based pagination, search, and role filtering.

**Auth**: Bearer (admin)

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | `string` | — | Pagination cursor (from previous response) |
| `limit` | `number` | `20` | Results per page (1–100) |
| `search` | `string` | — | Filter by email (partial match) |
| `role` | `string` | — | Filter by role: `admin` or `user` |

**Example**:

```bash
curl "http://localhost:3000/api/v1/admin/users?limit=10&role=user&search=example" \
  -H "Authorization: Bearer <admin-token>"
```

**Response** `200`:

```json
{
  "data": {
    "items": [
      {
        "id": "user-uuid-1",
        "email": "user1@example.com",
        "role": "user",
        "createdAt": 1708099200000,
        "updatedAt": 1708099200000
      },
      {
        "id": "user-uuid-2",
        "email": "user2@example.com",
        "role": "user",
        "createdAt": 1708099300000,
        "updatedAt": 1708099300000
      }
    ],
    "nextCursor": "eyJpZCI6InVzZXItdXVpZC0yIn0=",
    "hasMore": true,
    "total": 42
  }
}
```

### Pagination

Use cursor-based pagination for consistent results:

```bash
# First page
curl "http://localhost:3000/api/v1/admin/users?limit=10" \
  -H "Authorization: Bearer <admin-token>"

# Next page (use nextCursor from previous response)
curl "http://localhost:3000/api/v1/admin/users?limit=10&cursor=eyJpZCI6InVzZXItdXVpZC0yIn0=" \
  -H "Authorization: Bearer <admin-token>"
```

The cursor is a Base64-encoded string. Treat it as opaque — do not decode or construct cursors manually.

---

### `GET /api/v1/admin/users/:id`

Get a specific user by ID.

**Auth**: Bearer (admin)

**Response** `200`:

```json
{
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "role": "user",
    "createdAt": 1708099200000,
    "updatedAt": 1708099200000
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 404 | `NOT_FOUND` | User does not exist |

---

### `PATCH /api/v1/admin/users/:id/role`

Change a user's role.

**Auth**: Bearer (admin)

**Request Body**:

```json
{
  "role": "admin"
}
```

| Field | Type | Values |
|-------|------|--------|
| `role` | `string` | `admin` or `user` |

**Response** `200`:

```json
{
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "role": "admin",
    "createdAt": 1708099200000,
    "updatedAt": 1708099500000
  }
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Attempting to change your own role |
| 404 | `NOT_FOUND` | User does not exist |

**Audit**: This action is recorded in the audit log with `USER_ROLE_CHANGED`, including the actor's user ID and IP address.

---

### `POST /api/v1/admin/users/:id/ban`

Ban a user. Banned users cannot log in.

**Auth**: Bearer (admin)

**Request Body** (optional):

```json
{
  "reason": "Terms of service violation"
}
```

| Field | Type | Validation |
|-------|------|------------|
| `reason` | `string` | Optional, max 500 characters |

**Response** `204`: No content

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Attempting to ban yourself |
| 404 | `NOT_FOUND` | User does not exist |

**Audit**: Recorded as `USER_BANNED` with reason in metadata.

---

### `POST /api/v1/admin/users/:id/unban`

Unban a previously banned user.

**Auth**: Bearer (admin)

**Response** `204`: No content

**Errors**:

| Status | Code | When |
|--------|------|------|
| 404 | `NOT_FOUND` | User does not exist |

**Audit**: Recorded as `USER_UNBANNED`.

---

## Audit Log

All admin actions are recorded in an append-only audit log. Each entry includes:

| Field | Description |
|-------|-------------|
| `action` | The action performed (`USER_ROLE_CHANGED`, `USER_BANNED`, etc.) |
| `userId` | The admin who performed the action |
| `targetId` | The user affected by the action |
| `ip` | The admin's IP address |
| `metadata` | Additional context (e.g., ban reason, old role → new role) |
| `createdAt` | Timestamp |

This log is immutable — entries cannot be edited or deleted.

---

## Self-Protection

The admin API prevents administrators from performing destructive actions on themselves:

- **Cannot change own role**: Prevents accidental demotion
- **Cannot ban yourself**: Prevents lockout

These checks are enforced at the service layer with a `400 BAD_REQUEST` response.
