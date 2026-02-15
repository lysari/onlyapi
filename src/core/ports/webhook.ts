/**
 * Webhook registry port — manages outbound HTTP webhook subscriptions
 * that fire on domain events.
 */

import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";
import type { DomainEventType } from "./event-bus.js";

export interface WebhookSubscription {
  readonly id: string;
  readonly url: string;
  /** Event types this webhook listens for. Empty = all events. */
  readonly events: ReadonlyArray<DomainEventType>;
  /** Shared secret for HMAC-SHA256 signature verification */
  readonly secret: string;
  /** Whether this subscription is active */
  readonly active: boolean;
  /** ISO 8601 creation timestamp */
  readonly createdAt: string;
}

export interface CreateWebhookData {
  readonly url: string;
  readonly events: ReadonlyArray<DomainEventType>;
  readonly secret: string;
}

export interface WebhookDelivery {
  readonly id: string;
  readonly webhookId: string;
  readonly eventId: string;
  readonly url: string;
  readonly status: number;
  readonly success: boolean;
  readonly attemptNumber: number;
  readonly deliveredAt: string;
}

export interface WebhookRegistry {
  /** Create a new webhook subscription */
  create(data: CreateWebhookData): Result<WebhookSubscription, AppError>;

  /** List all active webhook subscriptions */
  list(): Result<ReadonlyArray<WebhookSubscription>, AppError>;

  /** Find subscriptions matching a specific event type */
  findByEvent(eventType: DomainEventType): Result<ReadonlyArray<WebhookSubscription>, AppError>;

  /** Remove a webhook subscription by ID */
  remove(id: string): Result<void, AppError>;

  /** Toggle a webhook subscription on/off */
  setActive(id: string, active: boolean): Result<void, AppError>;

  /** Record a delivery attempt */
  recordDelivery(delivery: WebhookDelivery): Result<void, AppError>;
}
