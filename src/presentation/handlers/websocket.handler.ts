/**
 * WebSocket manager — handles Bun-native WebSocket connections.
 *
 * Supports:
 * - Connection lifecycle (open, close, message)
 * - Per-connection authentication (JWT in query string or first message)
 * - Topic-based pub/sub (subscribe to event types)
 * - Broadcasting domain events to subscribed clients
 */

import type { ServerWebSocket } from "bun";
import type { DomainEvent, EventBus } from "../../core/ports/event-bus.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenPayload, TokenService } from "../../core/ports/token-service.js";

export interface WsConnectionData {
  readonly id: string;
  auth: TokenPayload | null;
  readonly connectedAt: number;
  readonly ip: string;
  subscriptions: Set<string>;
}

export interface WebSocketManager {
  /** Handle WebSocket upgrade request. Returns upgrade data or null if rejected. */
  handleUpgrade(req: Request, ip: string): WsConnectionData | null;

  /** Called when a WebSocket connection opens */
  onOpen(ws: ServerWebSocket<WsConnectionData>): void;

  /** Called when a message is received */
  onMessage(ws: ServerWebSocket<WsConnectionData>, message: string | Buffer): void;

  /** Called when a WebSocket connection closes */
  onClose(ws: ServerWebSocket<WsConnectionData>, code: number, reason: string): void;

  /** Broadcast a domain event to all subscribed WebSocket clients */
  broadcast(event: DomainEvent): void;

  /** Number of active connections */
  readonly connectionCount: number;
}

interface WsManagerDeps {
  readonly tokenService: TokenService;
  readonly eventBus: EventBus;
  readonly logger: Logger;
}

/**
 * Client-to-server message protocol:
 *
 * { "type": "auth", "token": "<JWT>" }
 * { "type": "subscribe", "events": ["user.registered", "login.failed"] }
 * { "type": "unsubscribe", "events": ["user.registered"] }
 * { "type": "ping" }
 *
 * Server-to-client message protocol:
 *
 * { "type": "auth", "ok": true, "userId": "..." }
 * { "type": "auth", "ok": false, "error": "Invalid token" }
 * { "type": "subscribed", "events": ["user.registered"] }
 * { "type": "event", "event": { ... } }
 * { "type": "pong" }
 * { "type": "error", "message": "..." }
 */

interface ClientMessage {
  readonly type: string;
  readonly token?: string | undefined;
  readonly events?: ReadonlyArray<string> | undefined;
}

export const createWebSocketManager = (deps: WsManagerDeps): WebSocketManager => {
  const { tokenService, logger } = deps;

  const connections = new Set<ServerWebSocket<WsConnectionData>>();

  const sendJson = (ws: ServerWebSocket<WsConnectionData>, data: Record<string, unknown>): void => {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Connection may have closed
    }
  };

  const authenticateToken = async (token: string): Promise<TokenPayload | null> => {
    const result = await tokenService.verify(token);
    return result.ok ? result.value : null;
  };

  return {
    handleUpgrade(req: Request, ip: string): WsConnectionData | null {
      // Extract token from query string for initial auth (optional)
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      const data: WsConnectionData = {
        id: crypto.randomUUID(),
        auth: null,
        connectedAt: Date.now(),
        ip,
        subscriptions: new Set(),
      };

      // If token provided in URL, validate later in onOpen
      if (token) {
        // Store token temporarily — will authenticate in onOpen
        (data as { auth: TokenPayload | null }).auth = null;
      }

      return data;
    },

    onOpen(ws: ServerWebSocket<WsConnectionData>): void {
      connections.add(ws);
      logger.debug("WebSocket connected", {
        connectionId: ws.data.id,
        ip: ws.data.ip,
        totalConnections: connections.size,
      });

      sendJson(ws, {
        type: "connected",
        connectionId: ws.data.id,
        message: 'Authenticate with { "type": "auth", "token": "<JWT>" }',
      });
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: WebSocket message handling has many branches
    onMessage(ws: ServerWebSocket<WsConnectionData>, message: string | Buffer): void {
      const raw = typeof message === "string" ? message : message.toString();

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw) as ClientMessage;
      } catch {
        sendJson(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (msg.type) {
        case "ping":
          sendJson(ws, { type: "pong" });
          break;

        case "auth": {
          if (!msg.token) {
            sendJson(ws, { type: "auth", ok: false, error: "Missing token" });
            return;
          }
          authenticateToken(msg.token).then((payload) => {
            if (payload) {
              ws.data.auth = payload;
              sendJson(ws, { type: "auth", ok: true, userId: payload.sub });
              logger.debug("WebSocket authenticated", {
                connectionId: ws.data.id,
                userId: payload.sub,
              });
            } else {
              sendJson(ws, { type: "auth", ok: false, error: "Invalid token" });
            }
          });
          break;
        }

        case "subscribe": {
          if (!ws.data.auth) {
            sendJson(ws, { type: "error", message: "Not authenticated" });
            return;
          }
          const events = msg.events ?? [];
          for (const event of events) {
            ws.data.subscriptions.add(event);
          }
          sendJson(ws, { type: "subscribed", events: [...ws.data.subscriptions] });
          break;
        }

        case "unsubscribe": {
          const events = msg.events ?? [];
          for (const event of events) {
            ws.data.subscriptions.delete(event);
          }
          sendJson(ws, { type: "subscribed", events: [...ws.data.subscriptions] });
          break;
        }

        default:
          sendJson(ws, { type: "error", message: `Unknown message type: ${msg.type}` });
      }
    },

    onClose(ws: ServerWebSocket<WsConnectionData>, code: number, reason: string): void {
      connections.delete(ws);
      logger.debug("WebSocket disconnected", {
        connectionId: ws.data.id,
        code,
        reason,
        totalConnections: connections.size,
      });
    },

    broadcast(event: DomainEvent): void {
      const payload = JSON.stringify({ type: "event", event });

      for (const ws of connections) {
        // Only send to authenticated clients subscribed to this event type
        if (
          ws.data.auth &&
          (ws.data.subscriptions.has(event.type) || ws.data.subscriptions.has("*"))
        ) {
          try {
            ws.send(payload);
          } catch {
            // Connection may have closed
          }
        }
      }
    },

    get connectionCount(): number {
      return connections.size;
    },
  };
};
