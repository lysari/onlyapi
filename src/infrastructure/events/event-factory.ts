/**
 * Domain event factory — creates properly structured DomainEvent instances.
 */

import type { DomainEvent, DomainEventType } from "../../core/ports/event-bus.js";
import type { UserId } from "../../core/types/brand.js";
import { generateId } from "../../shared/utils/id.js";

interface CreateEventOptions {
  readonly type: DomainEventType;
  readonly userId?: UserId | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
  readonly ip?: string | undefined;
}

export interface DomainEventFactory {
  create(options: CreateEventOptions): DomainEvent;
}

export const createDomainEventFactory = (): DomainEventFactory => ({
  create(options: CreateEventOptions): DomainEvent {
    return {
      id: generateId(),
      type: options.type,
      timestamp: new Date().toISOString(),
      ...(options.userId ? { userId: options.userId } : {}),
      payload: options.payload ?? {},
      ...(options.ip ? { ip: options.ip } : {}),
    };
  },
});
