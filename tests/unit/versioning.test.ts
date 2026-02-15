/**
 * Unit tests for API versioning middleware.
 */

import { describe, expect, test } from "bun:test";
import {
  addVersionHeaders,
  normalizeVersionedPath,
  resolveApiVersion,
} from "../../src/presentation/middleware/versioning.js";

describe("API Versioning: resolveApiVersion", () => {
  const req = new Request("http://localhost/test");

  test("returns v1 for /api/v1/ paths", () => {
    expect(resolveApiVersion("/api/v1/auth/login", req)).toBe("v1");
  });

  test("returns v2 for /api/v2/ paths", () => {
    expect(resolveApiVersion("/api/v2/auth/login", req)).toBe("v2");
  });

  test("uses Accept-Version header when path is not versioned", () => {
    const reqV1 = new Request("http://localhost/test", {
      headers: { "Accept-Version": "v1" },
    });
    expect(resolveApiVersion("/health", reqV1)).toBe("v1");
  });

  test("defaults to v2 when no version info", () => {
    expect(resolveApiVersion("/health", req)).toBe("v2");
  });
});

describe("API Versioning: normalizeVersionedPath", () => {
  test("normalizes /api/v2/ to /api/v1/", () => {
    const result = normalizeVersionedPath("/api/v2/auth/login");
    expect(result.normalized).toBe("/api/v1/auth/login");
    expect(result.version).toBe("v2");
  });

  test("leaves /api/v1/ unchanged", () => {
    const result = normalizeVersionedPath("/api/v1/users/me");
    expect(result.normalized).toBe("/api/v1/users/me");
    expect(result.version).toBe("v1");
  });

  test("non-versioned paths pass through as v2", () => {
    const result = normalizeVersionedPath("/health");
    expect(result.normalized).toBe("/health");
    expect(result.version).toBe("v2");
  });
});

describe("API Versioning: addVersionHeaders", () => {
  test("adds API-Version header for v2 (no deprecation)", () => {
    const response = new Response("ok");
    addVersionHeaders(response, "v2");
    expect(response.headers.get("API-Version")).toBe("v2");
    expect(response.headers.has("Deprecation")).toBe(false);
    expect(response.headers.has("Sunset")).toBe(false);
  });

  test("adds deprecation headers for v1", () => {
    const response = new Response("ok");
    addVersionHeaders(response, "v1", "/api/v2/users/me");
    expect(response.headers.get("API-Version")).toBe("v1");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toBeTruthy();
    expect(response.headers.get("Link")).toContain("/api/v2/users/me");
    expect(response.headers.get("Link")).toContain("successor-version");
  });

  test("v1 without v2Path omits Link header", () => {
    const response = new Response("ok");
    addVersionHeaders(response, "v1");
    expect(response.headers.get("API-Version")).toBe("v1");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.has("Link")).toBe(false);
  });
});
