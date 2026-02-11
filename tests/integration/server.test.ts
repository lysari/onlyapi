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

  // Dynamically import to pick up env
  const { loadConfig } = await import("../../src/infrastructure/config/config.js");
  const { createLogger } = await import("../../src/infrastructure/logging/logger.js");
  const { createPasswordHasher } = await import("../../src/infrastructure/security/password-hasher.js");
  const { createTokenService } = await import("../../src/infrastructure/security/token-service.js");
  const { createInMemoryUserRepository } = await import("../../src/infrastructure/database/in-memory-user.repository.js");
  const { createAuthService } = await import("../../src/application/services/auth.service.js");
  const { createUserService } = await import("../../src/application/services/user.service.js");
  const { createHealthService } = await import("../../src/application/services/health.service.js");
  const { createRouter } = await import("../../src/presentation/routes/router.js");
  const { createServer } = await import("../../src/presentation/server.js");

  const config = loadConfig();
  const logger = createLogger(config.log.level);
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService(config.jwt);
  const userRepo = createInMemoryUserRepository();

  const authService = createAuthService({ userRepo, passwordHasher, tokenService, logger });
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
