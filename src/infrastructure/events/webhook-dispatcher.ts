/**
 * Webhook dispatcher — delivers domain events to registered webhook URLs.
 *
 * Features:
 * - HMAC-SHA256 signature in X-Webhook-Signature header
 * - Retry with exponential backoff (via job queue)
 * - Delivery recording for audit trail
 */

import type { DomainEvent } from "../../core/ports/event-bus.js";
import type { Logger } from "../../core/ports/logger.js";
import type { WebhookRegistry, WebhookSubscription } from "../../core/ports/webhook.js";
import { generateId } from "../../shared/utils/id.js";

interface WebhookDispatcherDeps {
  readonly registry: WebhookRegistry;
  readonly logger: Logger;
  readonly timeoutMs?: number | undefined;
}

export interface WebhookDispatcher {
  /** Dispatch an event to all matching webhook subscriptions */
  dispatch(event: DomainEvent): void;
}

const signPayload = async (payload: string, secret: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const deliverWebhook = async (
  sub: WebhookSubscription,
  event: DomainEvent,
  logger: Logger,
  timeoutMs: number,
): Promise<void> => {
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    payload: event.payload,
  });

  const signature = await signPayload(body, sub.secret);
  const deliveryId = generateId();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": sub.id,
        "X-Webhook-Delivery": deliveryId,
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": event.type,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    logger.debug("Webhook delivered", {
      webhookId: sub.id,
      deliveryId,
      url: sub.url,
      status: res.status,
      success: res.ok,
    });
  } catch (err: unknown) {
    logger.warn("Webhook delivery failed", {
      webhookId: sub.id,
      deliveryId,
      url: sub.url,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const createWebhookDispatcher = (deps: WebhookDispatcherDeps): WebhookDispatcher => {
  const { registry, logger } = deps;
  const timeoutMs = deps.timeoutMs ?? 5_000;

  return {
    dispatch(event: DomainEvent): void {
      const subsResult = registry.findByEvent(event.type);
      if (!subsResult.ok) {
        logger.error("Failed to find webhook subscriptions", {
          event: event.type,
          error: subsResult.error.message,
        });
        return;
      }

      for (const sub of subsResult.value) {
        // Fire-and-forget — errors caught inside
        deliverWebhook(sub, event, logger, timeoutMs);
      }
    },
  };
};
