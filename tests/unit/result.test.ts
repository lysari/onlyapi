import { describe, expect, it } from "bun:test";
import { err, flatMap, map, ok, tryCatch, unwrapOr } from "../../src/core/types/result.js";

describe("Result monad", () => {
  it("ok wraps a value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(42);
  });

  it("err wraps an error", () => {
    const r = err("fail");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("fail");
  });

  it("map transforms ok value", () => {
    const r = map(ok(2), (n: number) => n * 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(6);
  });

  it("map passes through err", () => {
    const r = map(err("x") as ReturnType<typeof err<string>>, (_n: number) => 0);
    expect(r.ok).toBe(false);
  });

  it("flatMap chains results", () => {
    const r = flatMap(ok(10), (n: number) => (n > 5 ? ok(n) : err("too small")));
    expect(r.ok).toBe(true);
  });

  it("unwrapOr returns fallback on err", () => {
    expect(unwrapOr(err("x"), 0)).toBe(0);
    expect(unwrapOr(ok(99), 0)).toBe(99);
  });

  it("tryCatch catches thrown errors", () => {
    const r = tryCatch(() => {
      throw new Error("boom");
    });
    expect(r.ok).toBe(false);
  });

  it("tryCatch wraps success", () => {
    const r = tryCatch(() => 42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });
});
