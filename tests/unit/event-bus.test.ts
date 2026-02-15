import { describe, expect, test } from "bun:test";
import type { DomainEvent } from "../../src/core/ports/event-bus.js";
import { DomainEventType } from "../../src/core/ports/event-bus.js";
import { createEventBus } from "../../src/infrastructure/events/event-bus.js";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as import("../../src/core/ports/logger.js").Logger;

const makeEvent = (
  type: import("../../src/core/ports/event-bus.js").DomainEventType,
): DomainEvent => ({
  id: crypto.randomUUID(),
  type,
  timestamp: new Date().toISOString(),
  payload: { test: true },
});

describe("EventBus", () => {
  test("subscribe + publish delivers event to handler", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];
    bus.subscribe(DomainEventType.USER_REGISTERED, (e) => {
      received.push(e);
    });

    const event = makeEvent(DomainEventType.USER_REGISTERED);
    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe(event.id);
  });

  test("does not deliver events of different type", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];
    bus.subscribe(DomainEventType.USER_REGISTERED, (e) => {
      received.push(e);
    });

    bus.publish(makeEvent(DomainEventType.LOGIN_FAILED));

    expect(received).toHaveLength(0);
  });

  test("subscribeAll receives all event types", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];
    bus.subscribeAll((e) => {
      received.push(e);
    });

    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));
    bus.publish(makeEvent(DomainEventType.LOGIN_FAILED));
    bus.publish(makeEvent(DomainEventType.LOGOUT));

    expect(received).toHaveLength(3);
  });

  test("unsubscribe stops delivery", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];
    const unsub = bus.subscribe(DomainEventType.USER_REGISTERED, (e) => {
      received.push(e);
    });

    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));
    expect(received).toHaveLength(1);

    unsub();
    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));
    expect(received).toHaveLength(1); // No new event
  });

  test("unsubscribeAll stops wildcard delivery", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];
    const unsub = bus.subscribeAll((e) => {
      received.push(e);
    });

    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));
    unsub();
    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));

    expect(received).toHaveLength(1);
  });

  test("handlerCount tracks subscriptions", () => {
    const bus = createEventBus({ logger: noopLogger });
    expect(bus.handlerCount).toBe(0);

    const unsub1 = bus.subscribe(DomainEventType.USER_REGISTERED, () => {});
    expect(bus.handlerCount).toBe(1);

    const unsub2 = bus.subscribeAll(() => {});
    expect(bus.handlerCount).toBe(2);

    unsub1();
    expect(bus.handlerCount).toBe(1);

    unsub2();
    expect(bus.handlerCount).toBe(0);
  });

  test("throwing handler does not crash publisher", () => {
    const bus = createEventBus({ logger: noopLogger });
    const received: DomainEvent[] = [];

    bus.subscribe(DomainEventType.USER_REGISTERED, () => {
      throw new Error("boom");
    });
    bus.subscribe(DomainEventType.USER_REGISTERED, (e) => {
      received.push(e);
    });

    bus.publish(makeEvent(DomainEventType.USER_REGISTERED));

    // Second handler still received the event
    expect(received).toHaveLength(1);
  });

  test("multiple handlers for same type all fire", () => {
    const bus = createEventBus({ logger: noopLogger });
    let count = 0;

    bus.subscribe(DomainEventType.LOGIN_SUCCESS, () => {
      count++;
    });
    bus.subscribe(DomainEventType.LOGIN_SUCCESS, () => {
      count++;
    });
    bus.subscribe(DomainEventType.LOGIN_SUCCESS, () => {
      count++;
    });

    bus.publish(makeEvent(DomainEventType.LOGIN_SUCCESS));

    expect(count).toBe(3);
  });
});
