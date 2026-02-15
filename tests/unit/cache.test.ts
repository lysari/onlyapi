/**
 * Unit tests for in-memory cache adapter.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Cache } from "../../src/core/ports/cache.js";
import { createInMemoryCache } from "../../src/infrastructure/cache/in-memory-cache.js";

describe("In-Memory Cache", () => {
  let cache: Cache & { close: () => Promise<void> };

  beforeEach(() => {
    cache = createInMemoryCache();
  });

  afterEach(async () => {
    await cache.close();
  });

  test("get returns null for non-existent key", async () => {
    const result = await cache.get("nonexistent");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  test("set and get a string value", async () => {
    const setResult = await cache.set("key1", "hello");
    expect(setResult.ok).toBe(true);

    const getResult = await cache.get<string>("key1");
    expect(getResult.ok).toBe(true);
    if (getResult.ok) expect(getResult.value).toBe("hello");
  });

  test("set and get an object", async () => {
    const obj = { name: "test", count: 42 };
    await cache.set("obj", obj);

    const result = await cache.get<typeof obj>("obj");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(obj);
    }
  });

  test("set with TTL expires the entry", async () => {
    await cache.set("ttl-key", "value", 50); // 50ms TTL

    const before = await cache.get("ttl-key");
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.value).toBe("value");

    await Bun.sleep(60);

    const after = await cache.get("ttl-key");
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toBeNull();
  });

  test("del removes a key", async () => {
    await cache.set("del-key", "value");

    const delResult = await cache.del("del-key");
    expect(delResult.ok).toBe(true);
    if (delResult.ok) expect(delResult.value).toBe(true);

    const getResult = await cache.get("del-key");
    expect(getResult.ok).toBe(true);
    if (getResult.ok) expect(getResult.value).toBeNull();
  });

  test("del returns false for non-existent key", async () => {
    const result = await cache.del("doesnt-exist");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  test("has returns true for existing key", async () => {
    await cache.set("exists", "yes");
    const result = await cache.has("exists");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  test("has returns false for non-existent key", async () => {
    const result = await cache.has("nope");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  test("incr creates key if absent", async () => {
    const result = await cache.incr("counter");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1);
  });

  test("incr increments existing value", async () => {
    await cache.incr("counter");
    await cache.incr("counter");
    const result = await cache.incr("counter", 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });

  test("delPattern removes matching keys", async () => {
    await cache.set("rate:ip1", 1);
    await cache.set("rate:ip2", 2);
    await cache.set("other:key", 3);

    const result = await cache.delPattern("rate:*");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(2);

    const remaining = await cache.has("other:key");
    expect(remaining.ok).toBe(true);
    if (remaining.ok) expect(remaining.value).toBe(true);
  });

  test("close clears and stops", async () => {
    await cache.set("key", "val");
    await cache.close();
    // After close, operations should still work (graceful)
    const result = await cache.get("key");
    expect(result.ok).toBe(true);
  });
});
