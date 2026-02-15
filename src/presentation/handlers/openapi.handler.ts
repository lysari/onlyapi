/**
 * OpenAPI 3.1 specification — auto-generated from route definitions and Zod schemas.
 * Served at GET /docs (JSON) and GET /docs/html (embedded Swagger UI).
 * Zero external dependencies.
 */

import type { z } from "zod";
import { banUserDto, changeRoleDto } from "../../application/dtos/admin.dto.js";
import {
  loginDto,
  logoutDto,
  refreshDto,
  registerDto,
  updateUserDto,
} from "../../application/dtos/auth.dto.js";

/** Extract JSON Schema-like structure from a Zod schema */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: necessarily handles many Zod type variants
const zodToJsonSchema = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const def = schema._def;
  const typeName = def.typeName as string;

  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny;
      const fieldDef = fieldSchema._def;
      const isOptional = fieldDef.typeName === "ZodOptional";
      const inner = isOptional ? fieldDef.innerType : fieldSchema;

      properties[key] = zodToJsonSchema(inner);
      if (!isOptional) required.push(key);
    }

    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) result["required"] = required;
    return result;
  }

  if (typeName === "ZodString") {
    const result: Record<string, unknown> = { type: "string" };
    for (const check of def.checks ?? []) {
      const c = check as { kind: string; value?: unknown };
      if (c.kind === "email") result["format"] = "email";
      if (c.kind === "min") result["minLength"] = c.value;
      if (c.kind === "max") result["maxLength"] = c.value;
    }
    return result;
  }

  if (typeName === "ZodNumber") {
    const result: Record<string, unknown> = { type: "number" };
    for (const check of def.checks ?? []) {
      const c = check as { kind: string; value?: unknown };
      if (c.kind === "int") result["type"] = "integer";
      if (c.kind === "min") result["minimum"] = c.value;
      if (c.kind === "max") result["maximum"] = c.value;
    }
    return result;
  }

  if (typeName === "ZodEnum") {
    return { type: "string", enum: def.values };
  }

  if (typeName === "ZodDefault") {
    const inner = zodToJsonSchema(def.innerType);
    return { ...inner, default: def.defaultValue() };
  }

  if (typeName === "ZodEffects") {
    return zodToJsonSchema(def.schema);
  }

  if (typeName === "ZodOptional") {
    return zodToJsonSchema(def.innerType);
  }

  return { type: "string" };
};

/** Error response schema (reused across all endpoints) */
const errorResponseSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: { type: "object" },
      },
      required: ["code", "message"],
    },
    requestId: { type: "string" },
  },
};

/** Token pair response */
const tokenPairSchema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
      required: ["accessToken", "refreshToken"],
    },
  },
};

/** User view response */
const userViewSchema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["admin", "user"] },
        createdAt: { type: "integer" },
        updatedAt: { type: "integer" },
      },
      required: ["id", "email", "role", "createdAt", "updatedAt"],
    },
  },
};

/** Paginated user list response */
const paginatedUsersSchema = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: userViewSchema["properties"]["data"],
        },
        nextCursor: { type: ["string", "null"] },
        hasMore: { type: "boolean" },
      },
      required: ["items", "nextCursor", "hasMore"],
    },
  },
};

const securitySchemes = {
  BearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  },
};

const bearerSecurity = [{ BearerAuth: [] }];

/** Build the complete OpenAPI 3.1 specification */
export const buildOpenApiSpec = (): Record<string, unknown> => ({
  openapi: "3.1.0",
  info: {
    title: "onlyApi",
    version: "1.2.0",
    description:
      "Zero-dependency, enterprise-grade REST API built on Bun — fastest runtime, strictest TypeScript, cleanest architecture.",
    license: { name: "MIT", url: "https://github.com/lysari/onlyapi/blob/main/LICENSE" },
    contact: { name: "lysari", url: "https://github.com/lysari/onlyapi" },
  },
  servers: [{ url: "/", description: "Current server" }],
  components: {
    securitySchemes,
    schemas: {
      Error: errorResponseSchema,
      TokenPair: tokenPairSchema,
      UserView: userViewSchema,
      PaginatedUsers: paginatedUsersSchema,
      RegisterRequest: zodToJsonSchema(registerDto),
      LoginRequest: zodToJsonSchema(loginDto),
      RefreshRequest: zodToJsonSchema(refreshDto),
      LogoutRequest: zodToJsonSchema(logoutDto),
      UpdateUserRequest: zodToJsonSchema(updateUserDto),
      ChangeRoleRequest: zodToJsonSchema(changeRoleDto),
      BanUserRequest: zodToJsonSchema(banUserDto),
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Shallow health check",
        description: "Returns instant health status for load balancer probes.",
        responses: {
          "200": {
            description: "Healthy",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/readiness": {
      get: {
        tags: ["Health"],
        summary: "Deep readiness check",
        description: "Runs full health check including database connectivity.",
        responses: {
          "200": {
            description: "Ready",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "503": {
            description: "Not ready",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } },
          },
        },
        responses: {
          "201": {
            description: "User registered",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } } },
          },
          "409": {
            description: "Email already exists",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "422": {
            description: "Validation failed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } } },
          },
          "401": {
            description: "Invalid credentials",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "Account locked",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh token",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Token refreshed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } } },
          },
          "401": {
            description: "Invalid refresh token",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LogoutRequest" } },
          },
        },
        responses: {
          "204": { description: "Logged out" },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user profile",
        security: bearerSecurity,
        responses: {
          "200": {
            description: "User profile",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserView" } } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update current user profile",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRequest" } },
          },
        },
        responses: {
          "200": {
            description: "User updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserView" } } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Email conflict",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete current user account",
        security: bearerSecurity,
        responses: {
          "204": { description: "Account deleted" },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List all users (paginated)",
        security: bearerSecurity,
        parameters: [
          {
            name: "cursor",
            in: "query",
            schema: { type: "string" },
            description: "Pagination cursor",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
            description: "Page size",
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Search by email",
          },
          {
            name: "role",
            in: "query",
            schema: { type: "string", enum: ["admin", "user"] },
            description: "Filter by role",
          },
        ],
        responses: {
          "200": {
            description: "Paginated user list",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PaginatedUsers" } },
            },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/admin/users/{userId}": {
      get: {
        tags: ["Admin"],
        summary: "Get user by ID",
        security: bearerSecurity,
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "User detail",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserView" } } },
          },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/admin/users/{userId}/role": {
      patch: {
        tags: ["Admin"],
        summary: "Change user role",
        security: bearerSecurity,
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ChangeRoleRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Role changed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserView" } } },
          },
          "403": {
            description: "Cannot change own role",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/admin/users/{userId}/ban": {
      post: {
        tags: ["Admin"],
        summary: "Ban a user",
        security: bearerSecurity,
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BanUserRequest" } },
          },
        },
        responses: {
          "204": { description: "User banned" },
          "403": {
            description: "Cannot ban yourself",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/admin/users/{userId}/unban": {
      post: {
        tags: ["Admin"],
        summary: "Unban a user",
        security: bearerSecurity,
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "204": { description: "User unbanned" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
  },
  tags: [
    { name: "Health", description: "Health and readiness probes" },
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Users", description: "User profile management" },
    { name: "Admin", description: "Administrative user management (admin only)" },
  ],
});

/** Serve the OpenAPI spec as JSON */
export const openApiHandler = (): { json: () => Response; html: () => Response } => {
  let cachedSpec: string | null = null;
  let cachedHtml: string | null = null;

  return {
    json: (): Response => {
      if (cachedSpec === null) {
        cachedSpec = JSON.stringify(buildOpenApiSpec(), null, 2);
      }
      return new Response(cachedSpec, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },

    html: (): Response => {
      if (cachedHtml === null) {
        cachedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>onlyApi — API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUI({ url: '/docs', dom_id: '#swagger-ui', deepLinking: true });
  </script>
</body>
</html>`;
      }
      return new Response(cachedHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  };
};
