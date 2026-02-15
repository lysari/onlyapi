/**
 * Server-Sent Events (SSE) handler — streaming endpoint for real-time updates.
 *
 * Clients connect to GET /api/v1/events/stream with optional query params:
 * - token: JWT for authentication (required)
 * - events: comma-separated event types to subscribe to (default: all)
 *
 * Protocol: standard SSE (text/event-stream), each event is:
 *   event: <type>
 *   id: <eventId>
 *   data: <JSON payload>
 *
 * Heartbeat "ping" comments sent every 30s to keep the connection alive.
 */

import type { DomainEvent, EventBus } from "../../core/ports/event-bus.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { RequestContext } from "../context.js";

interface SseHandlerDeps {
  readonly tokenService: TokenService;
  readonly eventBus: EventBus;
  readonly logger: Logger;
}

interface SseConnection {
  readonly id: string;
  readonly controller: ReadableStreamDefaultController;
  readonly unsubscribe: () => void;
  readonly heartbeat: ReturnType<typeof setInterval>;
}

export interface SseHandler {
  /** Handle SSE connection request */
  stream(req: Request, ctx: RequestContext): Promise<Response>;
  /** Number of active SSE connections */
  readonly connectionCount: number;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

const encoder = new TextEncoder();

const formatSseMessage = (event: DomainEvent): string => {
  const data = JSON.stringify({
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    payload: event.payload,
  });
  return `event: ${event.type}\nid: ${event.id}\ndata: ${data}\n\n`;
};

export const createSseHandler = (deps: SseHandlerDeps): SseHandler => {
  const { tokenService, eventBus, logger } = deps;

  const connections = new Map<string, SseConnection>();

  return {
    async stream(req: Request, ctx: RequestContext): Promise<Response> {
      // Authenticate via query param or Authorization header
      const url = new URL(req.url);
      const token =
        url.searchParams.get("token") ?? req.headers.get("authorization")?.replace("Bearer ", "");

      if (!token) {
        return new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Missing token" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const authResult = await tokenService.verify(token);
      if (!authResult.ok) {
        return new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Parse event filter
      const eventFilter = url.searchParams.get("events");
      const subscribedEvents = eventFilter
        ? new Set(eventFilter.split(",").map((e) => e.trim()))
        : null;

      const connectionId = ctx.requestId as string;

      const stream = new ReadableStream({
        start(controller) {
          // Send initial connection message
          controller.enqueue(
            encoder.encode(
              `: connected\nevent: connected\ndata: ${JSON.stringify({ connectionId })}\n\n`,
            ),
          );

          // Subscribe to events
          const handler = (event: DomainEvent): void => {
            if (subscribedEvents && !subscribedEvents.has(event.type)) return;
            try {
              controller.enqueue(encoder.encode(formatSseMessage(event)));
            } catch {
              // Stream may have closed
            }
          };

          // Subscribe to all events (filtering done in handler)
          const unsubscribe = eventBus.subscribeAll(handler);

          // Heartbeat to keep connection alive
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              // Stream closed
            }
          }, HEARTBEAT_INTERVAL_MS);

          connections.set(connectionId, {
            id: connectionId,
            controller,
            unsubscribe,
            heartbeat,
          });

          logger.debug("SSE client connected", {
            connectionId,
            userId: authResult.value.sub,
            events: subscribedEvents ? [...subscribedEvents] : "*",
            totalConnections: connections.size,
          });
        },

        cancel() {
          const conn = connections.get(connectionId);
          if (conn) {
            conn.unsubscribe();
            clearInterval(conn.heartbeat);
            connections.delete(connectionId);
          }
          logger.debug("SSE client disconnected", {
            connectionId,
            totalConnections: connections.size,
          });
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Disable Nginx buffering
        },
      });
    },

    get connectionCount(): number {
      return connections.size;
    },
  };
};
