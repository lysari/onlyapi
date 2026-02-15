import { describe, expect, it } from "bun:test";
import { AlertLevel } from "../../src/core/ports/alert-sink.js";
import { createNoopAlertSink } from "../../src/infrastructure/alerting/webhook.js";

describe("Alert Sink", () => {
  describe("NoopAlertSink", () => {
    it("reports as not enabled", () => {
      const sink = createNoopAlertSink();
      expect(sink.enabled).toBe(false);
    });

    it("send() completes without error", async () => {
      const sink = createNoopAlertSink();
      await sink.send({
        level: AlertLevel.CRITICAL,
        title: "Test alert",
        message: "This should not go anywhere",
        timestamp: new Date().toISOString(),
        source: "test",
      });
      // No error thrown = pass
    });
  });

  describe("AlertLevel", () => {
    it("has the expected values", () => {
      expect(AlertLevel.WARNING).toBe("warning");
      expect(AlertLevel.CRITICAL).toBe("critical");
      expect(AlertLevel.RESOLVED).toBe("resolved");
    });
  });
});
