import { describe, expect, test } from "bun:test";
import { DomainEventType } from "../../src/core/ports/event-bus.js";
import type { UserId } from "../../src/core/types/brand.js";
import { brand } from "../../src/core/types/brand.js";
import { createDomainEventFactory } from "../../src/infrastructure/events/event-factory.js";

describe("DomainEventFactory", () => {
  test("creates event with required fields", () => {
    const factory = createDomainEventFactory();
    const event = factory.create({
      type: DomainEventType.USER_REGISTERED,
    });

    expect(event.id).toBeDefined();
    expect(event.type).toBe("user.registered");
    expect(event.timestamp).toBeDefined();
    expect(event.payload).toEqual({});
  });

  test("creates event with userId and payload", () => {
    const factory = createDomainEventFactory();
    const userId = brand<string, "UserId">("user-123") as UserId;
    const event = factory.create({
      type: DomainEventType.LOGIN_SUCCESS,
      userId,
      payload: { email: "test@example.com" },
      ip: "127.0.0.1",
    });

    expect(event.userId).toBe(userId);
    expect(event.payload).toEqual({ email: "test@example.com" });
    expect(event.ip).toBe("127.0.0.1");
  });

  test("generates unique event IDs", () => {
    const factory = createDomainEventFactory();
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(factory.create({ type: DomainEventType.LOGOUT }).id);
    }

    expect(ids.size).toBe(100);
  });

  test("omits optional fields when not provided", () => {
    const factory = createDomainEventFactory();
    const event = factory.create({ type: DomainEventType.USER_DELETED });

    expect("userId" in event).toBe(false);
    expect("ip" in event).toBe(false);
  });
});
