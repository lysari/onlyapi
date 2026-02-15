import { describe, it, expect, beforeAll, afterAll } from "bun:test";

let server: ReturnType<typeof Bun.serve>;
const BASE = "http://localhost:3199";

beforeAll(async () => {
  // Set env for test
  process.env["NODE_ENV"] = "test";
  process.env["PORT"] = "3199";
  process.env["HOST"] = "127.0.0.1";
  process.env["JWT_SECRET"] = "test-secret-that-is-definitely-at-least-32-characters-long!!";
  process.env["JWT_EXPIRES_IN"] = "15m";
  process.env["JWT_REFRESH_EXPIRES_IN"] = "7d";
  process.env["CORS_ORIGINS"] = "*";
  process.env["LOG_LEVEL"] = "error"; // quiet for tests
  process.env["DATABASE_PATH"] = ":memory:";
  process.env["LOCKOUT_MAX_ATTEMPTS"] = "3";
  process.env["LOCKOUT_DURATION_MS"] = "5000";

  // Dynamically import to pick up env
  const { Database } = await import("bun:sqlite");
  const { loadConfig } = await import("../../src/infrastructure/config/config.js");
  const { createLogger } = await import("../../src/infrastructure/logging/logger.js");
  const { createPasswordHasher } = await import("../../src/infrastructure/security/password-hasher.js");
  const { createTokenService } = await import("../../src/infrastructure/security/token-service.js");
  const { createInMemoryTokenBlacklist } = await import("../../src/infrastructure/security/token-blacklist.js");
  const { createInMemoryAccountLockout } = await import("../../src/infrastructure/security/account-lockout.js");
  const { createSqliteUserRepository } = await import("../../src/infrastructure/database/sqlite-user.repository.js");
  const { migrateUp } = await import("../../src/infrastructure/database/migrations/runner.js");
  const { createAuthService } = await import("../../src/application/services/auth.service.js");
  const { createUserService } = await import("../../src/application/services/user.service.js");
  const { createHealthService } = await import("../../src/application/services/health.service.js");
  const { createRouter } = await import("../../src/presentation/routes/router.js");
  const { createServer } = await import("../../src/presentation/server.js");

  const config = loadConfig();
  const logger = createLogger(config.log.level);
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService(config.jwt);

  // SQLite in-memory for tests
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  await migrateUp(db, logger);

  const userRepo = createSqliteUserRepository(db);
  const tokenBlacklist = createInMemoryTokenBlacklist();
  const accountLockout = createInMemoryAccountLockout({
    maxAttempts: 3,
    lockoutDurationMs: 5000,
  });

  const authService = createAuthService({ userRepo, passwordHasher, tokenService, tokenBlacklist, accountLockout, logger });
  const userService = createUserService({ userRepo, passwordHasher, logger });
  const healthService = createHealthService({ logger, version: "test" });

  const router = createRouter({ authService, userService, healthService, tokenService, logger });
  const srv = createServer({ config, logger, router });
  server = srv.start();
});

afterAll(() => {
  server.stop();
});

describe("Integration: Health", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("ok");
  });

  it("includes security headers", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("Integration: Auth flow", () => {
  let accessToken = "";
  let refreshToken = "";

  it("POST /api/v1/auth/register creates user", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "int@test.com", password: "Test1234!" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    expect(body.data.accessToken).toBeTruthy();
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  it("POST /api/v1/auth/login returns tokens", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "int@test.com", password: "Test1234!" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    expect(body.data.accessToken).toBeTruthy();
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  it("POST /api/v1/auth/login rejects bad password", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "int@test.com", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/refresh returns new tokens", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/users/me returns authenticated user", async () => {
    const res = await fetch(`${BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe("int@test.com");
  });

  it("GET /api/v1/users/me rejects without token", async () => {
    const res = await fetch(`${BASE}/api/v1/users/me`);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/users/me updates user", async () => {
    const res = await fetch(`${BASE}/api/v1/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email: "updated@test.com" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe("updated@test.com");
  });

  it("DELETE /api/v1/users/me removes user", async () => {
    const res = await fetch(`${BASE}/api/v1/users/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(204);
  });
});

describe("Integration: Error handling", () => {
  it("404 for unknown routes", async () => {
    const res = await fetch(`${BASE}/api/v1/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("422 for invalid registration body", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });
    expect(res.status).toBe(422);
  });

  it("CORS preflight returns 204", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(204);
  });
});

describe("Integration: Logout", () => {
  let accessToken = "";
  let refreshToken = "";

  it("register + login to get tokens", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "logout@test.com", password: "Test1234!" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  it("POST /api/v1/auth/logout returns 204", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(204);
  });

  it("refresh with blacklisted token fails", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(401);
  });

  it("logout without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "some-token" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Integration: Account lockout", () => {
  it("register a user for lockout testing", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lockout@test.com", password: "Test1234!" }),
    });
    expect(res.status).toBe(201);
  });

  it("locks account after 3 failed attempts", async () => {
    // 3 failed attempts (maxAttempts = 3 in test config)
    for (let i = 0; i < 3; i++) {
      await fetch(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "lockout@test.com", password: "wrong" }),
      });
    }

    // 4th attempt should be locked
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lockout@test.com", password: "Test1234!" }),
    });
    expect(res.status).toBe(403);
  });
});
