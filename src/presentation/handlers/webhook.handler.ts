/**
 * Webhook management API handlers.
 *
 * POST   /api/v1/webhooks       — Create a webhook subscription
 * GET    /api/v1/webhooks       — List webhook subscriptions
 * DELETE /api/v1/webhooks/:id   — Remove a webhook subscription
 */

import { UserRole } from "../../core/entities/user.entity.js";
import type { DomainEventType } from "../../core/ports/event-bus.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { WebhookRegistry } from "../../core/ports/webhook.js";
import type { RequestContext } from "../context.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { errorResponse, jsonResponse } from "./response.js";

export const webhookHandlers = (
  registry: WebhookRegistry,
  tokenService: TokenService,
  logger: Logger,
) => {
  const requireAdmin = async (req: Request, _ctx: RequestContext) => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) return authResult;
    return authorise(authResult.value, [UserRole.ADMIN]);
  };

  return {
    async create(req: Request, ctx: RequestContext): Promise<Response> {
      const authResult = await requireAdmin(req, ctx);
      if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

      const body = (await req.json().catch(() => null)) as {
        url?: string;
        events?: string[];
        secret?: string;
      } | null;

      if (!body || !body.url || typeof body.url !== "string") {
        return errorResponse(
          { code: "VALIDATION" as const, message: "url is required" },
          ctx.requestId,
        );
      }
      if (!body.secret || typeof body.secret !== "string") {
        return errorResponse(
          { code: "VALIDATION" as const, message: "secret is required" },
          ctx.requestId,
        );
      }

      const events = body.events ?? [];
      const result = registry.create({
        url: body.url,
        events: events as ReadonlyArray<DomainEventType>,
        secret: body.secret,
      });

      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      logger.info("Webhook subscription created", {
        webhookId: result.value.id,
        url: result.value.url,
        events,
      });

      return Response.json({ data: result.value }, { status: 201 });
    },

    async list(req: Request, ctx: RequestContext): Promise<Response> {
      const authResult = await requireAdmin(req, ctx);
      if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

      const result = registry.list();
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return jsonResponse({ webhooks: result.value });
    },

    async remove(req: Request, ctx: RequestContext, webhookId: string): Promise<Response> {
      const authResult = await requireAdmin(req, ctx);
      if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

      const result = registry.remove(webhookId);
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      logger.info("Webhook subscription removed", { webhookId });
      return jsonResponse({ deleted: true });
    },
  };
};
