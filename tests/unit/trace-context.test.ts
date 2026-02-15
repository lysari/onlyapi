import { describe, expect, it } from "bun:test";
import {
  createTraceContext,
  formatTraceparent,
  parseTraceparent,
  resolveTraceContext,
} from "../../src/infrastructure/tracing/trace-context.js";

describe("W3C Trace Context", () => {
  describe("createTraceContext", () => {
    it("generates a valid trace context", () => {
      const ctx = createTraceContext();
      expect(ctx.traceId).toHaveLength(32);
      expect(ctx.spanId).toHaveLength(16);
      expect(ctx.parentSpanId).toBeUndefined();
      expect(ctx.flags).toBe(1); // sampled
    });

    it("generates unique trace IDs", () => {
      const ctx1 = createTraceContext();
      const ctx2 = createTraceContext();
      expect(ctx1.traceId).not.toBe(ctx2.traceId);
      expect(ctx1.spanId).not.toBe(ctx2.spanId);
    });

    it("generates valid hex strings", () => {
      const ctx = createTraceContext();
      expect(/^[0-9a-f]{32}$/.test(ctx.traceId)).toBe(true);
      expect(/^[0-9a-f]{16}$/.test(ctx.spanId)).toBe(true);
    });
  });

  describe("parseTraceparent", () => {
    it("parses a valid traceparent header", () => {
      const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const ctx = parseTraceparent(header);

      expect(ctx).toBeDefined();
      expect(ctx?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(ctx?.parentSpanId).toBe("00f067aa0ba902b7");
      expect(ctx?.flags).toBe(1);
      // Span ID should be newly generated, not the parent
      expect(ctx?.spanId).toHaveLength(16);
      expect(ctx?.spanId).not.toBe("00f067aa0ba902b7");
    });

    it("returns undefined for null header", () => {
      expect(parseTraceparent(null)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(parseTraceparent("")).toBeUndefined();
    });

    it("returns undefined for invalid format", () => {
      expect(parseTraceparent("invalid")).toBeUndefined();
      expect(parseTraceparent("00-short-id-01")).toBeUndefined();
      expect(
        parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
      ).toBeUndefined();
    });

    it("rejects all-zero trace ID", () => {
      const header = "00-00000000000000000000000000000000-00f067aa0ba902b7-01";
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it("rejects all-zero span ID", () => {
      const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01";
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it("handles unsampled flag (00)", () => {
      const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00";
      const ctx = parseTraceparent(header);
      expect(ctx?.flags).toBe(0);
    });
  });

  describe("resolveTraceContext", () => {
    it("creates new context when no header present", () => {
      const ctx = resolveTraceContext(null);
      expect(ctx.traceId).toHaveLength(32);
      expect(ctx.parentSpanId).toBeUndefined();
    });

    it("propagates existing trace context from header", () => {
      const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const ctx = resolveTraceContext(header);
      expect(ctx.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(ctx.parentSpanId).toBe("00f067aa0ba902b7");
    });

    it("creates new context for invalid header", () => {
      const ctx = resolveTraceContext("garbage");
      expect(ctx.traceId).toHaveLength(32);
      expect(ctx.parentSpanId).toBeUndefined();
    });
  });

  describe("formatTraceparent", () => {
    it("formats a traceparent string from context", () => {
      const header = formatTraceparent({
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        parentSpanId: undefined,
        flags: 1,
      });

      expect(header).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    });

    it("formats unsampled flag", () => {
      const header = formatTraceparent({
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        parentSpanId: undefined,
        flags: 0,
      });

      expect(header).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00");
    });

    it("roundtrips correctly", () => {
      const original = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const ctx = parseTraceparent(original);
      expect(ctx).toBeDefined();
      if (ctx) {
        const formatted = formatTraceparent(ctx);
        // traceId and flags should match, but spanId is newly generated
        expect(formatted.startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-")).toBe(true);
        expect(formatted.endsWith("-01")).toBe(true);
      }
    });
  });
});
