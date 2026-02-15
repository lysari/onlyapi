/**
 * In-memory webhook registry — stores webhook subscriptions in a Map.
 *
 * For production use, swap with a SQLite/Redis-backed adapter.
 */

import type { AppError } from "../../core/errors/app-error.js";
import { notFound } from "../../core/errors/app-error.js";
import type { DomainEventType } from "../../core/ports/event-bus.js";
import type {
  CreateWebhookData,
  WebhookDelivery,
  WebhookRegistry,
  WebhookSubscription,
} from "../../core/ports/webhook.js";
import type { Result } from "../../core/types/result.js";
import { err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

export const createInMemoryWebhookRegistry = (): WebhookRegistry => {
  const store = new Map<string, WebhookSubscription>();
  const deliveries: WebhookDelivery[] = [];

  return {
    create(data: CreateWebhookData): Result<WebhookSubscription, AppError> {
      const sub: WebhookSubscription = {
        id: generateId(),
        url: data.url,
        events: [...data.events],
        secret: data.secret,
        active: true,
        createdAt: new Date().toISOString(),
      };
      store.set(sub.id, sub);
      return ok(sub);
    },

    list(): Result<ReadonlyArray<WebhookSubscription>, AppError> {
      return ok([...store.values()]);
    },

    findByEvent(eventType: DomainEventType): Result<ReadonlyArray<WebhookSubscription>, AppError> {
      const matching = [...store.values()].filter(
        (sub) => sub.active && (sub.events.length === 0 || sub.events.includes(eventType)),
      );
      return ok(matching);
    },

    remove(id: string): Result<void, AppError> {
      if (!store.has(id)) return err(notFound("Webhook subscription"));
      store.delete(id);
      return ok(undefined);
    },

    setActive(id: string, active: boolean): Result<void, AppError> {
      const sub = store.get(id);
      if (!sub) return err(notFound("Webhook subscription"));
      store.set(id, { ...sub, active });
      return ok(undefined);
    },

    recordDelivery(delivery: WebhookDelivery): Result<void, AppError> {
      deliveries.push(delivery);
      return ok(undefined);
    },
  };
};
