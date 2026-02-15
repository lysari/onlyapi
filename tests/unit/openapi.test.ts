import { describe, expect, it } from "bun:test";
import { buildOpenApiSpec } from "../../src/presentation/handlers/openapi.handler.js";

describe("OpenAPI 3.1 spec", () => {
  const spec = buildOpenApiSpec();

  it("has correct OpenAPI version", () => {
    expect(spec["openapi"]).toBe("3.1.0");
  });

  it("has API info", () => {
    const info = spec["info"] as Record<string, unknown>;
    expect(info["title"]).toBe("onlyApi");
    expect(info["version"]).toBe("1.2.0");
    expect(info["description"]).toBeDefined();
  });

  it("includes all expected paths", () => {
    const paths = spec["paths"] as Record<string, unknown>;
    const expectedPaths = [
      "/health",
      "/readiness",
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/auth/refresh",
      "/api/v1/auth/logout",
      "/api/v1/users/me",
      "/api/v1/admin/users",
      "/api/v1/admin/users/{userId}",
      "/api/v1/admin/users/{userId}/role",
      "/api/v1/admin/users/{userId}/ban",
      "/api/v1/admin/users/{userId}/unban",
    ];

    for (const path of expectedPaths) {
      expect(paths[path]).toBeDefined();
    }
  });

  it("has security schemes", () => {
    const components = spec["components"] as Record<string, unknown>;
    const schemes = components["securitySchemes"] as Record<string, unknown>;
    expect(schemes["BearerAuth"]).toBeDefined();
    const bearer = schemes["BearerAuth"] as Record<string, unknown>;
    expect(bearer["type"]).toBe("http");
    expect(bearer["scheme"]).toBe("bearer");
  });

  it("has component schemas", () => {
    const components = spec["components"] as Record<string, unknown>;
    const schemas = components["schemas"] as Record<string, unknown>;
    const expectedSchemas = [
      "Error",
      "TokenPair",
      "UserView",
      "PaginatedUsers",
      "RegisterRequest",
      "LoginRequest",
      "RefreshRequest",
      "LogoutRequest",
      "UpdateUserRequest",
      "ChangeRoleRequest",
      "BanUserRequest",
    ];

    for (const name of expectedSchemas) {
      expect(schemas[name]).toBeDefined();
    }
  });

  it("generates correct schema for RegisterRequest", () => {
    const components = spec["components"] as Record<string, unknown>;
    const schemas = components["schemas"] as Record<string, unknown>;
    const registerSchema = schemas["RegisterRequest"] as Record<string, unknown>;

    expect(registerSchema["type"]).toBe("object");
    const props = registerSchema["properties"] as Record<string, unknown>;
    expect(props["email"]).toBeDefined();
    expect(props["password"]).toBeDefined();

    const emailSchema = props["email"] as Record<string, unknown>;
    expect(emailSchema["type"]).toBe("string");
  });

  it("admin endpoints require bearer security", () => {
    const paths = spec["paths"] as Record<string, Record<string, Record<string, unknown>>>;
    const adminList = paths["/api/v1/admin/users"]?.["get"];
    expect(adminList?.["security"]).toBeDefined();
  });

  it("health endpoints do not require security", () => {
    const paths = spec["paths"] as Record<string, Record<string, Record<string, unknown>>>;
    const health = paths["/health"]?.["get"];
    expect(health?.["security"]).toBeUndefined();
  });

  it("paths have tags", () => {
    const paths = spec["paths"] as Record<string, Record<string, Record<string, unknown>>>;
    const health = paths["/health"]?.["get"];
    expect(health?.["tags"]).toContain("Health");

    const register = paths["/api/v1/auth/register"]?.["post"];
    expect(register?.["tags"]).toContain("Auth");

    const adminList = paths["/api/v1/admin/users"]?.["get"];
    expect(adminList?.["tags"]).toContain("Admin");
  });
});
