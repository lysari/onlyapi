# Getting Started

This guide walks you through installing, configuring, and running onlyApi for the first time.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| [Bun](https://bun.sh) | >= 1.1 | Runtime and package manager |
| Git | any | For cloning the repository |
| PostgreSQL | >= 14 | **Optional** — only if using the `postgres` driver |
| Redis | >= 6 | **Optional** — only if enabling cache layer |

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify the installation:

```bash
bun --version
```

---

## Option A: Scaffold a New Project (Recommended)

The CLI scaffolding tool creates a fully configured project in seconds:

```bash
bunx onlyapi init my-api
cd my-api
bun install
```

This generates:

- Full project directory structure
- Pre-configured `package.json`, `tsconfig.json`, `biome.json`
- Example `.env` file with sensible defaults
- All source files ready to customise

### Start the Development Server

```bash
bun run dev
```

The server starts on `http://localhost:3000` with hot-reload enabled (`--watch`).

---

## Option B: Clone the Repository

```bash
git clone https://github.com/lysari/onlyapi.git
cd onlyApi
bun install
```

### Create Your Environment File

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
JWT_SECRET=your-secret-at-least-32-characters-long
```

> **Important**: `JWT_SECRET` is the only required variable. It must be at least 32 characters. All other variables have sensible defaults.

### Start the Development Server

```bash
bun run dev
```

---

## Verify It Works

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "data": {
    "status": "ok",
    "version": "1.5.0",
    "uptime": 1.234,
    "timestamp": "2026-02-16T12:00:00.000Z"
  }
}
```

### OpenAPI Documentation

Open `http://localhost:3000/docs/html` in your browser to view the interactive Swagger UI, or fetch the raw spec:

```bash
curl http://localhost:3000/docs
```

---

## Register Your First User

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Str0ngP@ss!"}' | jq
```

Response:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Str0ngP@ss!"}' | jq
```

### Access a Protected Resource

```bash
export TOKEN="<accessToken from login response>"

curl -s http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

Response:

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@example.com",
    "role": "user",
    "createdAt": 1708099200000,
    "updatedAt": 1708099200000
  }
}
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Development server with hot-reload |
| `bun run start` | Production single-process |
| `bun run start:cluster` | Production multi-process (1 worker per CPU core) |
| `bun run build` | Bundle and minify to `dist/` |
| `bun run check` | TypeScript type-checking (`tsc --noEmit`) |
| `bun test` | Run all 351 tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run lint` | Lint source code with Biome |
| `bun run lint:fix` | Auto-fix lint issues |

---

## Production Modes

### Single Process

```bash
NODE_ENV=production bun run start
```

### Multi-Process Cluster

```bash
NODE_ENV=production bun run start:cluster
```

Spawns one worker per CPU core (configurable via `WORKERS` env var). Uses `SO_REUSEPORT` for kernel-level load balancing across workers.

---

## Next Steps

- [Configuration](configuration.md) — Customise all environment variables
- [API Reference](api-reference.md) — Explore every endpoint
- [Authentication](authentication.md) — Understand JWT, MFA, and OAuth flows
- [Database](database.md) — Choose between SQLite and PostgreSQL
- [Deployment](deployment.md) — Docker, Kubernetes, and CI/CD
