import type { AdminService } from "../../application/services/admin.service.js";
import type { AuthService } from "../../application/services/auth.service.js";
import type { HealthService } from "../../application/services/health.service.js";
import type { UserService } from "../../application/services/user.service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { RequestContext } from "../context.js";
import { adminHandlers } from "../handlers/admin.handler.js";
import { authHandlers } from "../handlers/auth.handler.js";
import { healthHandler } from "../handlers/health.handler.js";
import { openApiHandler } from "../handlers/openapi.handler.js";
import { userHandlers } from "../handlers/user.handler.js";

/**
 * Zero-alloc radix-style router.
 * Static routes use O(1) map lookup.
 * Parametric routes (admin) use prefix matching.
 */
type RouteHandler = (req: Request, ctx: RequestContext) => Promise<Response>;

interface RouterDeps {
  readonly authService: AuthService;
  readonly userService: UserService;
  readonly healthService: HealthService;
  readonly adminService: AdminService;
  readonly tokenService: TokenService;
  readonly logger: Logger;
}

/** Admin route prefix for parametric matching */
const ADMIN_PREFIX = "/api/v1/admin/users/";

export const createRouter = (deps: RouterDeps) => {
  const { logger } = deps;
  const health = healthHandler(deps.healthService);
  const auth = authHandlers(
    deps.authService,
    deps.tokenService,
    logger.child({ layer: "handler", handler: "auth" }),
  );
  const users = userHandlers(
    deps.userService,
    deps.tokenService,
    logger.child({ layer: "handler", handler: "user" }),
  );
  const admin = adminHandlers(
    deps.adminService,
    deps.tokenService,
    logger.child({ layer: "handler", handler: "admin" }),
  );
  const docs = openApiHandler();

  /** Pre-computed 404 body template */
  const notFound404 = (method: string, path: string): Response => {
    logger.debug("Route not found", { method, path });
    const body = `{"error":{"code":"NOT_FOUND","message":"${method} ${path} not found"}}`;
    return new Response(body, {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  };

  /** Static route table — fastest possible lookup */
  const routes = new Map<string, RouteHandler>([
    // Health — shallow (instant) for probes, deep for readiness
    ["GET /health", async (_req, _ctx) => health.shallowCheck()],
    ["GET /readiness", async (_req, _ctx) => health.deepCheck()],

    // Auth
    ["POST /api/v1/auth/register", auth.register],
    ["POST /api/v1/auth/login", auth.login],
    ["POST /api/v1/auth/refresh", auth.refresh],
    ["POST /api/v1/auth/logout", auth.logout],

    // Users (authenticated)
    ["GET /api/v1/users/me", users.getMe],
    ["PATCH /api/v1/users/me", users.updateMe],
    ["DELETE /api/v1/users/me", users.deleteMe],

    // Admin — list endpoint (no userId param)
    ["GET /api/v1/admin/users", admin.listUsers],

    // OpenAPI documentation
    ["GET /docs", async (_req, _ctx) => docs.json()],
    ["GET /docs/html", async (_req, _ctx) => docs.html()],
  ]);

  /**
   * Match parametric admin routes: /api/v1/admin/users/:id{/action}
   * Returns the handler or null.
   */
  const matchAdmin = (
    method: string,
    path: string,
  ): // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parametric route matching requires many branches
  ((req: Request, ctx: RequestContext) => Promise<Response>) | null => {
    if (!path.startsWith(ADMIN_PREFIX)) return null;

    const rest = path.substring(ADMIN_PREFIX.length);
    const slashIdx = rest.indexOf("/");

    if (slashIdx === -1) {
      // /api/v1/admin/users/:id
      const userId = rest;
      if (method === "GET") return (req, ctx) => admin.getUser(req, ctx, userId);
      return null;
    }

    const userId = rest.substring(0, slashIdx);
    const action = rest.substring(slashIdx + 1);

    if (method === "PATCH" && action === "role") {
      return (req, ctx) => admin.changeRole(req, ctx, userId);
    }
    if (method === "POST" && action === "ban") {
      return (req, ctx) => admin.banUser(req, ctx, userId);
    }
    if (method === "POST" && action === "unban") {
      return (req, ctx) => admin.unbanUser(req, ctx, userId);
    }

    return null;
  };

  return {
    handle(req: Request, ctx: RequestContext, path: string): Promise<Response> {
      // 1. Try static routes first (O(1))
      const handler = routes.get(`${req.method} ${path}`);
      if (handler) return handler(req, ctx);

      // 2. Try parametric admin routes
      const adminHandler = matchAdmin(req.method, path);
      if (adminHandler) return adminHandler(req, ctx);

      return Promise.resolve(notFound404(req.method, path));
    },
  };
};

export type Router = ReturnType<typeof createRouter>;
