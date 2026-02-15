import { describe, expect, it } from "bun:test";
import { decodeCursor, encodeCursor } from "../../src/core/types/pagination.js";

describe("Cursor-based pagination", () => {
  it("encodeCursor returns a base64 string", () => {
    const cursor = encodeCursor("1700000000000");
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);
  });

  it("decodeCursor reverses encodeCursor", () => {
    const original = "1700000000000";
    const encoded = encodeCursor(original);
    const decoded = decodeCursor(encoded);
    expect(decoded).toBe(original);
  });

  it("decodeCursor returns null for invalid base64", () => {
    expect(decodeCursor("!!!invalid!!!")).toBeNull();
  });

  it("round-trips arbitrary string values", () => {
    const values = ["abc", "2024-01-01T00:00:00Z", "12345", ""];
    for (const v of values) {
      expect(decodeCursor(encodeCursor(v))).toBe(v);
    }
  });

  it("produces URL-safe strings", () => {
    const cursor = encodeCursor("test-value-12345");
    // base64 uses A-Z, a-z, 0-9, +, /, =
    expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
