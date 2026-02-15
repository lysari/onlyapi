import { describe, expect, it } from "bun:test";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

describe("Logger — JSON format", () => {
  it("json format outputs valid JSON lines", () => {
    const output: string[] = [];
    const originalWrite = process.stdout.write;

    // Intercept stdout
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const logger = createLogger("info", {}, "json");
      logger.info("test message", { key: "value" });
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(output.length).toBe(1);
    const line = output[0]?.trim();
    expect(line).toBeDefined();

    const parsed = JSON.parse(line ?? "");
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
    expect(parsed.key).toBe("value");
    expect(parsed.time).toBeDefined();
    // time should be ISO format
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
  });

  it("json format includes bindings", () => {
    const output: string[] = [];
    const originalWrite = process.stdout.write;

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const logger = createLogger("info", { service: "test" }, "json");
      logger.info("hello");
    } finally {
      process.stdout.write = originalWrite;
    }

    const parsed = JSON.parse((output[0] ?? "").trim());
    expect(parsed.service).toBe("test");
  });

  it("child logger inherits format", () => {
    const output: string[] = [];
    const originalWrite = process.stdout.write;

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const parent = createLogger("info", {}, "json");
      const child = parent.child({ requestId: "abc-123" });
      child.info("child log");
    } finally {
      process.stdout.write = originalWrite;
    }

    const parsed = JSON.parse((output[0] ?? "").trim());
    expect(parsed.requestId).toBe("abc-123");
    expect(parsed.msg).toBe("child log");
  });

  it("respects log level filtering", () => {
    const output: string[] = [];
    const originalWrite = process.stdout.write;

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const logger = createLogger("warn", {}, "json");
      logger.debug("should not appear");
      logger.info("should not appear");
      logger.warn("should appear");
    } finally {
      process.stdout.write = originalWrite;
    }

    // Only warn should appear (debug and info below threshold)
    // warn goes to stderr, not stdout — update
    expect(output.length).toBe(0);
  });

  it("warn and error go to stderr in json mode", () => {
    const output: string[] = [];
    const originalWrite = process.stderr.write;

    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const logger = createLogger("warn", {}, "json");
      logger.warn("warning message");
      logger.error("error message");
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(output.length).toBe(2);
    const warn = JSON.parse((output[0] ?? "").trim());
    const error = JSON.parse((output[1] ?? "").trim());
    expect(warn.level).toBe("warn");
    expect(error.level).toBe("error");
  });

  it("pretty format does not output JSON", () => {
    const output: string[] = [];
    const originalWrite = process.stdout.write;

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      const logger = createLogger("info", {}, "pretty");
      logger.info("pretty log");
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(output.length).toBe(1);
    // should NOT be valid JSON (it includes ANSI colors)
    expect(() => JSON.parse((output[0] ?? "").trim())).toThrow();
  });
});
