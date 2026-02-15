/**
 * Domain event system — typed events emitted by application services
 * and consumed by subscribers (webhooks, SSE, WebSocket, audit log, etc.).
 *
 * Zero-dependency, strongly typed, Result-based.
 */

import type { UserId } from "../types/brand.js";

// ─── Domain Event Types ───

export const DomainEventType = {
  USER_REGISTERED: "user.registered",
  USER_DELETED: "user.deleted",
  USER_UPDATED: "user.updated",
  LOGIN_SUCCESS: "login.success",
  LOGIN_FAILED: "login.failed",
  LOGOUT: "logout",
  PASSWORD_CHANGED: "password.changed",
  PASSWORD_RESET: "password.reset",
  EMAIL_VERIFIED: "email.verified",
  MFA_ENABLED: "mfa.enabled",
  MFA_DISABLED: "mfa.disabled",
  API_KEY_CREATED: "api_key.created",
  API_KEY_REVOKED: "api_key.revoked",
  ACCOUNT_LOCKED: "account.locked",
  ACCOUNT_UNLOCKED: "account.unlocked",
} as const;

export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

// ─── Domain Event ───

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  /** Unique event ID */
  readonly id: string;
  /** Event type discriminator */
  readonly type: T;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** User who triggered the event (if applicable) */
  readonly userId?: UserId | undefined;
  /** Event-specific payload */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Source IP address */
  readonly ip?: string | undefined;
}

// ─── Event Handler ───

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

// ─── Event Bus Port ───

export interface EventBus {
  /**
   * Publish a domain event to all subscribers.
   * Fire-and-forget semantics — errors in handlers are logged, not propagated.
   */
  publish(event: DomainEvent): void;

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  subscribe(type: DomainEventType, handler: EventHandler): () => void;

  /**
   * Subscribe to ALL event types (wildcard).
   * Returns an unsubscribe function.
   */
  subscribeAll(handler: EventHandler): () => void;

  /**
   * Number of registered handlers (for diagnostics).
   */
  readonly handlerCount: number;
}
