# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-11

### Added

- Clean Architecture project structure (core / application / infrastructure / presentation)
- Bun.serve() HTTP server with inlined hot-path optimizations
- O(1) Map-based router — no regex, no radix tree
- `Result<T, E>` monad for error handling (no throw-based control flow)
- Branded types: `UserId`, `RequestId`, `Timestamp`
- Auth endpoints: register, login, refresh
- User endpoints: get profile, update, delete
- Health endpoints: shallow (`/health`) and deep (`/readiness`)
- Argon2id password hashing via Bun.password (native)
- HMAC-SHA256 JWT via Web Crypto API (zero external deps)
- Zod-validated environment config with fail-fast on boot
- Structured JSON logger with batched async writes
- Per-IP sliding-window rate limiter (inlined on hot path)
- Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- CORS middleware with configurable origin allowlist
- Request validation middleware using Zod schemas
- Bearer token auth middleware
- Multi-process clustering with SO_REUSEPORT (`src/cluster.ts`)
- DI container with symbol tokens (no decorators, no reflect-metadata)
- 41 tests (unit + integration) — all passing
- Biome linting with strict rules (no `any`, no `!`, cognitive complexity cap)
- TypeScript strict mode with 22+ compiler flags
- Benchmarking setup with bombardier
