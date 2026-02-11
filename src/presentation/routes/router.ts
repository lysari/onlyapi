import type { RequestContext } from "../context.js";
import type { AuthService } from "../../application/services/auth.service.js";
import type { UserService } from "../../application/services/user.service.js";
import type { HealthService } from "../../application/services/health.service.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { Logger } from "../../core/ports/logger.js";
import { healthHandler } from "../handlers/health.handler.js";
import { authHandlers } from "../handlers/auth.handler.js";
import { userHandlers } from "../handlers/user.handler.js";

/**
 * Zero-alloc radix-style router.
 * Matches method + path with O(1) map lookup — no regex overhead.
 */
type RouteHandler = (req: Request, ctx: RequestContext) => Promise<Response>;

interface RouterDeps {
  readonly authService: AuthService;
  readonly userService: UserService;
  readonly healthService: HealthService;
  readonly tokenService: TokenService;
  readonly logger: Logger;
}

export const createRouter = (deps: RouterDeps) => {
  const { logger } = deps;
  const health = healthHandler(deps.healthService);
  const auth = authHandlers(deps.authService, logger.child({ layer: "handler", handler: "auth" }));
  const users = userHandlers(deps.userService, deps.tokenService, logger.child({ layer: "handler", handler: "user" }));

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

    // Users (authenticated)
    ["GET /api/v1/users/me", users.getMe],
    ["PATCH /api/v1/users/me", users.updateMe],
    ["DELETE /api/v1/users/me", users.deleteMe],
  ]);

  return {
    handle(req: Request, ctx: RequestContext, path: string): Promise<Response> {
      const handler = routes.get(`${req.method} ${path}`);
      if (!handler) {
        return Promise.resolve(notFound404(req.method, path));
      }
      return handler(req, ctx);
    },
  };
};

export type Router = ReturnType<typeof createRouter>;
