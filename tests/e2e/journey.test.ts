/**
 * E2E Test Suite — full client simulation.
 *
 * Tests the API through real HTTP requests against a running server,
 * covering complete user journeys end-to-end. Starts a fresh server
 * per test file with an isolated database.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;

/** Parsed response shape for E2E convenience */
interface ApiResponse {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: E2E tests need dynamic access to parsed JSON
  data: any;
  headers: Headers;
}

/** Helper to make JSON API calls */
const api = async (
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<ApiResponse> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts.headers,
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const raw = contentType.includes("json") ? await res.json() : await res.text();
  // Unwrap { data: ... } envelope for convenience; keep errors/non-envelope as-is
  const data = raw !== null && typeof raw === "object" && "data" in raw ? raw.data : raw;
  return { status: res.status, data, headers: res.headers };
};

// ── Server lifecycle ──
let serverProc: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/main.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      JWT_SECRET: "e2e-test-secret-that-is-at-least-32-characters-long!!",
      JWT_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      DATABASE_PATH: `data/e2e-test-${Date.now()}.sqlite`,
      CORS_ORIGINS: "*",
      I18N_SUPPORTED_LOCALES: "en,es,fr,de,ja",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {
      // Not ready yet
    }
    await Bun.sleep(200);
  }
});

afterAll(() => {
  serverProc?.kill();
});

// ── E2E: Complete User Journey ──

describe("E2E: Complete User Journey", () => {
  let accessToken = "";
  let refreshToken = "";
  const testEmail = `e2e-${Date.now()}@test.com`;
  const testPassword = "SecurePassw0rd!@#";

  test("health check returns 200", async () => {
    const { status, data } = await api("GET", "/health");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
  });

  test("readiness check returns 200", async () => {
    const { status, data } = await api("GET", "/readiness");
    expect(status).toBe(200);
    expect(data.status).toBeDefined();
  });

  test("register a new user", async () => {
    const { status, data } = await api("POST", "/api/v1/auth/register", {
      body: { email: testEmail, password: testPassword },
    });
    expect(status).toBe(201);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  test("cannot register duplicate email", async () => {
    const { status } = await api("POST", "/api/v1/auth/register", {
      body: { email: testEmail, password: testPassword },
    });
    expect(status).toBe(409);
  });

  test("login with valid credentials", async () => {
    const { status, data } = await api("POST", "/api/v1/auth/login", {
      body: { email: testEmail, password: testPassword },
    });
    expect(status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  test("login with wrong password returns 401", async () => {
    const { status } = await api("POST", "/api/v1/auth/login", {
      body: { email: testEmail, password: "WrongPassword123!" },
    });
    expect(status).toBe(401);
  });

  test("get current user (authenticated)", async () => {
    const { status, data } = await api("GET", "/api/v1/users/me", {
      token: accessToken,
    });
    expect(status).toBe(200);
    expect(data.email).toBe(testEmail);
  });

  test("get current user without token returns 401", async () => {
    const { status } = await api("GET", "/api/v1/users/me");
    expect(status).toBe(401);
  });

  test("refresh token rotation", async () => {
    // Small delay so JWT iat differs from the login token
    await Bun.sleep(1100);
    const { status, data } = await api("POST", "/api/v1/auth/refresh", {
      body: { refreshToken },
    });
    expect(status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  test("update user profile", async () => {
    const { status, data } = await api("PATCH", "/api/v1/users/me", {
      token: accessToken,
      body: { email: `updated-${testEmail}` },
    });
    expect(status).toBe(200);
    expect(data.email).toBe(`updated-${testEmail}`);
  });

  test("logout invalidates token", async () => {
    const { status } = await api("POST", "/api/v1/auth/logout", {
      token: accessToken,
      body: { refreshToken },
    });
    expect(status).toBe(204);
  });

  test("after logout, refresh token is invalidated", async () => {
    // Note: Access tokens are stateless JWTs — they remain valid until expiry.
    // The refresh token however is revoked server-side, so refreshing should fail.
    const { status } = await api("POST", "/api/v1/auth/refresh", {
      body: { refreshToken },
    });
    // Refresh token was revoked on logout
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

// ── E2E: API Versioning ──

describe("E2E: API Versioning", () => {
  test("v1 endpoints include deprecation headers", async () => {
    const { headers } = await api("GET", "/api/v1/users/me");
    expect(headers.get("API-Version")).toBe("v1");
    expect(headers.get("Deprecation")).toBe("true");
    expect(headers.get("Sunset")).toBeTruthy();
  });

  test("v2 endpoints work and show v2 version", async () => {
    // Register for v2 test
    const email = `e2e-v2-${Date.now()}@test.com`;
    const { status, data, headers } = await api("POST", "/api/v2/auth/register", {
      body: { email, password: "SecurePassw0rd!@#" },
    });
    expect(status).toBe(201);
    expect(headers.get("API-Version")).toBe("v2");
    expect(headers.get("Deprecation")).toBeNull();
    expect(data.accessToken).toBeDefined();
  });
});

// ── E2E: i18n ──

describe("E2E: i18n", () => {
  test("Content-Language header is set", async () => {
    const { headers } = await api("GET", "/health");
    expect(headers.get("Content-Language")).toBeTruthy();
  });

  test("Accept-Language: es returns Content-Language: es", async () => {
    const { headers } = await api("GET", "/health", {
      headers: { "Accept-Language": "es" },
    });
    expect(headers.get("Content-Language")).toBe("es");
  });

  test("Accept-Language: fr returns Content-Language: fr", async () => {
    const { headers } = await api("GET", "/health", {
      headers: { "Accept-Language": "fr;q=0.9, de;q=0.8" },
    });
    expect(headers.get("Content-Language")).toBe("fr");
  });
});

// ── E2E: Security Headers ──

describe("E2E: Security Headers", () => {
  test("responses include security headers", async () => {
    const { headers } = await api("GET", "/health");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("responses include rate limit headers", async () => {
    const { headers } = await api("GET", "/health");
    expect(headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  test("responses include request ID", async () => {
    const { headers } = await api("GET", "/health");
    expect(headers.get("X-Request-Id")).toBeTruthy();
  });

  test("custom request ID is echoed back", async () => {
    const customId = "custom-req-12345";
    const { headers } = await api("GET", "/health", {
      headers: { "X-Request-Id": customId },
    });
    expect(headers.get("X-Request-Id")).toBe(customId);
  });
});

// ── E2E: Error Handling ──

describe("E2E: Error Handling", () => {
  test("404 for unknown routes", async () => {
    const { status, data } = await api("GET", "/api/v1/nonexistent");
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  test("validation errors for bad input", async () => {
    const { status, data } = await api("POST", "/api/v1/auth/register", {
      body: { email: "not-an-email", password: "x" },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(data.error).toBeDefined();
  });
});

// ── E2E: OpenAPI & Metrics ──

describe("E2E: OpenAPI & Metrics", () => {
  test("GET /docs returns OpenAPI JSON", async () => {
    const { status, data } = await api("GET", "/docs");
    expect(status).toBe(200);
    expect(data.openapi).toBeDefined();
  });

  test("GET /metrics returns Prometheus text", async () => {
    const res = await fetch(`${BASE}/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("http_requests_total");
  });
});

// ── E2E: CORS ──

describe("E2E: CORS", () => {
  test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
  });
});

// ── E2E: ETag / Conditional GET ──

describe("E2E: ETag & Conditional GET", () => {
  test("GET /health returns ETag header", async () => {
    const { headers } = await api("GET", "/health");
    expect(headers.get("ETag")).toBeTruthy();
  });

  test("If-None-Match returns 304 when content unchanged", async () => {
    // Use /docs endpoint — its body is static (no uptime), so the ETag is stable
    const first = await fetch(`${BASE}/docs`);
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const res = await fetch(`${BASE}/docs`, {
      headers: { "If-None-Match": etag as string },
    });
    expect(res.status).toBe(304);
  });
});
