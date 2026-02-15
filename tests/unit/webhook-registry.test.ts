import { describe, expect, test } from "bun:test";
import { DomainEventType } from "../../src/core/ports/event-bus.js";
import { createInMemoryWebhookRegistry } from "../../src/infrastructure/events/in-memory-webhook-registry.js";

describe("InMemoryWebhookRegistry", () => {
  test("create adds a webhook subscription", () => {
    const registry = createInMemoryWebhookRegistry();
    const result = registry.create({
      url: "https://example.com/hook",
      events: [DomainEventType.USER_REGISTERED],
      secret: "my-secret",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.url).toBe("https://example.com/hook");
      expect(result.value.events).toEqual([DomainEventType.USER_REGISTERED]);
      expect(result.value.active).toBe(true);
      expect(result.value.id).toBeDefined();
    }
  });

  test("list returns all subscriptions", () => {
    const registry = createInMemoryWebhookRegistry();
    registry.create({ url: "https://a.com/hook", events: [], secret: "s1" });
    registry.create({ url: "https://b.com/hook", events: [], secret: "s2" });

    const result = registry.list();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  test("findByEvent returns matching subscriptions", () => {
    const registry = createInMemoryWebhookRegistry();
    registry.create({
      url: "https://a.com/hook",
      events: [DomainEventType.USER_REGISTERED],
      secret: "s1",
    });
    registry.create({
      url: "https://b.com/hook",
      events: [DomainEventType.LOGIN_FAILED],
      secret: "s2",
    });
    // Wildcard (empty events = all)
    registry.create({ url: "https://c.com/hook", events: [], secret: "s3" });

    const result = registry.findByEvent(DomainEventType.USER_REGISTERED);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should match the specific + wildcard subscription
      expect(result.value).toHaveLength(2);
    }
  });

  test("remove deletes a subscription", () => {
    const registry = createInMemoryWebhookRegistry();
    const createResult = registry.create({
      url: "https://a.com/hook",
      events: [],
      secret: "s1",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const removeResult = registry.remove(createResult.value.id);
    expect(removeResult.ok).toBe(true);

    const listResult = registry.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(0);
    }
  });

  test("remove returns error for unknown id", () => {
    const registry = createInMemoryWebhookRegistry();
    const result = registry.remove("nonexistent");
    expect(result.ok).toBe(false);
  });

  test("setActive toggles subscription", () => {
    const registry = createInMemoryWebhookRegistry();
    const createResult = registry.create({
      url: "https://a.com/hook",
      events: [DomainEventType.USER_REGISTERED],
      secret: "s1",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    // Disable
    registry.setActive(createResult.value.id, false);
    const findResult = registry.findByEvent(DomainEventType.USER_REGISTERED);
    expect(findResult.ok).toBe(true);
    if (findResult.ok) {
      expect(findResult.value).toHaveLength(0); // Inactive, not returned
    }

    // Re-enable
    registry.setActive(createResult.value.id, true);
    const findResult2 = registry.findByEvent(DomainEventType.USER_REGISTERED);
    expect(findResult2.ok).toBe(true);
    if (findResult2.ok) {
      expect(findResult2.value).toHaveLength(1);
    }
  });

  test("recordDelivery stores delivery record", () => {
    const registry = createInMemoryWebhookRegistry();
    const result = registry.recordDelivery({
      id: "d1",
      webhookId: "w1",
      eventId: "e1",
      url: "https://a.com/hook",
      status: 200,
      success: true,
      attemptNumber: 1,
      deliveredAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(true);
  });
});
