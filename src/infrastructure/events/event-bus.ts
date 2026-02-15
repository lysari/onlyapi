/**
 * In-memory event bus implementation.
 *
 * Synchronous publish with async handler execution (fire-and-forget).
 * Handlers that throw are caught and logged — never crash the publisher.
 */

import type {
  DomainEvent,
  DomainEventType,
  EventBus,
  EventHandler,
} from "../../core/ports/event-bus.js";
import type { Logger } from "../../core/ports/logger.js";

interface EventBusDeps {
  readonly logger: Logger;
}

export const createEventBus = (deps: EventBusDeps): EventBus => {
  const { logger } = deps;

  /** type → Set<handler> */
  const handlers = new Map<DomainEventType, Set<EventHandler>>();
  /** Wildcard handlers that receive ALL events */
  const wildcardHandlers = new Set<EventHandler>();

  const getOrCreate = (type: DomainEventType): Set<EventHandler> => {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    return set;
  };

  const invokeHandler = (handler: EventHandler, event: DomainEvent): void => {
    try {
      const result = handler(event);
      // If handler returns a Promise, catch async errors
      if (result && typeof result === "object" && "catch" in result) {
        (result as Promise<void>).catch((err: unknown) => {
          logger.error("Async event handler error", {
            event: event.type,
            eventId: event.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err: unknown) {
      logger.error("Sync event handler error", {
        event: event.type,
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    publish(event: DomainEvent): void {
      logger.debug("Event published", { type: event.type, eventId: event.id });

      // Type-specific handlers
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          invokeHandler(handler, event);
        }
      }

      // Wildcard handlers
      for (const handler of wildcardHandlers) {
        invokeHandler(handler, event);
      }
    },

    subscribe(type: DomainEventType, handler: EventHandler): () => void {
      const set = getOrCreate(type);
      set.add(handler);
      logger.debug("Event handler subscribed", { type, handlerCount: set.size });

      return () => {
        set.delete(handler);
        if (set.size === 0) handlers.delete(type);
      };
    },

    subscribeAll(handler: EventHandler): () => void {
      wildcardHandlers.add(handler);
      logger.debug("Wildcard event handler subscribed", { handlerCount: wildcardHandlers.size });

      return () => {
        wildcardHandlers.delete(handler);
      };
    },

    get handlerCount(): number {
      let count = wildcardHandlers.size;
      for (const set of handlers.values()) {
        count += set.size;
      }
      return count;
    },
  };
};
