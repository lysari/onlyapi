# onlyApi Documentation

Welcome to the full documentation for **onlyApi** — a production-ready REST API foundation built on [Bun](https://bun.sh).

---

## Table of Contents

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started.md) | Installation, prerequisites, first run |
| [Configuration](configuration.md) | All environment variables and validation |
| [API Reference](api-reference.md) | Every endpoint with request/response examples |
| [Authentication](authentication.md) | JWT, refresh tokens, MFA, OAuth2, API keys |
| [Database](database.md) | SQLite, PostgreSQL, migrations, repositories |
| [Caching](caching.md) | In-memory cache, Redis (zero-dep RESP) |
| [Real-time](real-time.md) | WebSocket protocol and Server-Sent Events |
| [Security](security.md) | Password hashing, headers, CORS, rate limiting |
| [Observability](observability.md) | Logging, Prometheus metrics, tracing, alerting |
| [Error Handling](error-handling.md) | Error codes, Result monad, response shapes |
| [Architecture](architecture.md) | Clean architecture, DI container, module layout |
| [Deployment](deployment.md) | Docker, Kubernetes, Helm, CI/CD pipelines |
| [CLI](cli.md) | Scaffold and upgrade projects from the command line |
| [Testing](testing.md) | Unit, integration, E2E, and load testing |
| [Internationalisation](i18n.md) | Multi-language support and locale negotiation |
| [Admin API](admin-api.md) | User management, roles, bans, audit log |
| [Events & Webhooks](events-webhooks.md) | Domain events, event bus, webhook delivery |

---

## Quick Links

```bash
# Scaffold a new project
bunx onlyapi init my-api && cd my-api && bun run dev

# Run tests
bun test

# Start production server
bun run start

# Start production cluster
bun run start:cluster
```

---

## Project Information

- **Runtime**: Bun >= 1.1
- **Language**: TypeScript (22+ strict flags)
- **Dependencies**: `zod` (sole runtime dependency)
- **License**: MIT
- **Repository**: [github.com/lysari/onlyapi](https://github.com/lysari/onlyapi)
