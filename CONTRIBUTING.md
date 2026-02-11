# Contributing to onlyApi

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Fork & clone** the repository
2. Install [Bun](https://bun.sh) >= 1.1
3. Install dependencies:
   ```bash
   bun install
   ```
4. Copy the environment config:
   ```bash
   cp .env.example .env
   ```
5. Verify everything works:
   ```bash
   bun run check && bun test
   ```

## Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes
3. Ensure all checks pass:
   ```bash
   bun run check     # TypeScript strict type-check
   bun test          # All tests must pass
   bun run lint      # Biome linting
   ```
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add user search endpoint
   fix: handle empty JWT payload
   docs: update API examples
   refactor: extract rate-limit store
   test: add token expiry edge case
   chore: bump zod to 3.25
   ```
5. Push and open a Pull Request against `main`

## Code Standards

### Architecture

This project follows **Clean Architecture** (Hexagonal / Ports & Adapters):

```
core/          → Domain entities, ports (interfaces), value types — ZERO dependencies
application/   → Use cases, DTOs — depends only on core
infrastructure/→ Adapters (database, logging, security) — implements core ports
presentation/  → HTTP handlers, middleware, router — depends on application
```

**Rules:**
- `core/` must NEVER import from any other layer
- `application/` imports only from `core/`
- `infrastructure/` implements ports defined in `core/`
- `presentation/` orchestrates everything

### TypeScript

- All code must pass `tsc --noEmit` with the strictest config (22+ flags)
- Use `Result<T, E>` instead of `throw` for expected errors
- Use branded types (`UserId`, `RequestId`) for domain identifiers
- No `any` — enforced by both TypeScript and Biome
- No non-null assertions (`!`) — enforced by Biome

### Error Handling

- **Expected errors**: Return `Result.err(appError(...))` — never throw
- **Unexpected errors**: Let them propagate to the top-level catch in `server.ts`
- Use `AppError` factory functions: `badRequest()`, `unauthorized()`, `notFound()`, etc.

### Testing

- Unit tests go in `tests/unit/`
- Integration tests go in `tests/integration/`
- Test file naming: `<module>.test.ts`
- All new features must include tests
- All 41+ existing tests must continue to pass

## Adding a New Endpoint

1. **DTO** — Add Zod schema in `src/application/dtos/`
2. **Service** — Add or extend a service in `src/application/services/`
3. **Handler** — Create handler in `src/presentation/handlers/`
4. **Route** — Register in `src/presentation/routes/router.ts`
5. **Test** — Add integration test in `tests/integration/`

## Adding a New Infrastructure Adapter

1. Implement the port interface from `src/core/ports/`
2. Place adapter in `src/infrastructure/<category>/`
3. Register in the DI container (`src/shared/container.ts`)
4. Add unit tests in `tests/unit/`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if the API surface changes
- Ensure CI passes before requesting review
- Rebase on `main` before merging (no merge commits)

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Bun version)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
