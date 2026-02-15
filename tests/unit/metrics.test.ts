import { beforeEach, describe, expect, it } from "bun:test";
import { createMetricsCollector } from "../../src/infrastructure/metrics/prometheus.js";

describe("Prometheus Metrics", () => {
  let metrics: ReturnType<typeof createMetricsCollector>;

  beforeEach(() => {
    metrics = createMetricsCollector();
  });

  describe("Counter", () => {
    it("starts at zero", () => {
      expect(metrics.httpRequestsTotal.get()).toBe(0);
    });

    it("increments by 1 by default", () => {
      metrics.httpRequestsTotal.inc();
      expect(metrics.httpRequestsTotal.get()).toBe(1);
    });

    it("increments by custom value", () => {
      metrics.httpRequestsTotal.inc(undefined, 5);
      expect(metrics.httpRequestsTotal.get()).toBe(5);
    });

    it("tracks separate label sets independently", () => {
      metrics.httpRequestsTotal.inc({ method: "GET", status: "200" });
      metrics.httpRequestsTotal.inc({ method: "POST", status: "201" });
      metrics.httpRequestsTotal.inc({ method: "GET", status: "200" });

      expect(metrics.httpRequestsTotal.get({ method: "GET", status: "200" })).toBe(2);
      expect(metrics.httpRequestsTotal.get({ method: "POST", status: "201" })).toBe(1);
    });

    it("serializes to Prometheus text format", () => {
      metrics.httpRequestsTotal.inc({ method: "GET", status: "200" });
      metrics.httpRequestsTotal.inc({ method: "GET", status: "200" });
      metrics.httpRequestsTotal.inc({ method: "POST", status: "500" });

      const output = metrics.serialize();
      expect(output).toContain("# HELP http_requests_total Total number of HTTP requests");
      expect(output).toContain("# TYPE http_requests_total counter");
      expect(output).toContain('http_requests_total{method="GET",status="200"} 2');
      expect(output).toContain('http_requests_total{method="POST",status="500"} 1');
    });
  });

  describe("Histogram", () => {
    it("observes values and tracks count/sum", () => {
      metrics.httpRequestDurationMs.observe(10);
      metrics.httpRequestDurationMs.observe(20);
      metrics.httpRequestDurationMs.observe(30);

      const snapshot = metrics.httpRequestDurationMs.get();
      expect(snapshot).toBeDefined();
      expect(snapshot?.count).toBe(3);
      expect(snapshot?.sum).toBe(60);
    });

    it("populates histogram buckets correctly", () => {
      metrics.httpRequestDurationMs.observe(3); // fits in 5, 10, 25, ...
      metrics.httpRequestDurationMs.observe(15); // fits in 25, 50, ...
      metrics.httpRequestDurationMs.observe(150); // fits in 250, 500, ...

      const snapshot = metrics.httpRequestDurationMs.get();
      expect(snapshot).toBeDefined();
      expect(snapshot?.buckets.get(5)).toBe(1); // only 3ms fits
      expect(snapshot?.buckets.get(10)).toBe(1); // only 3ms fits
      expect(snapshot?.buckets.get(25)).toBe(2); // 3ms + 15ms
      expect(snapshot?.buckets.get(250)).toBe(3); // all three
    });

    it("serializes histogram with cumulative buckets", () => {
      metrics.httpRequestDurationMs.observe(5, { method: "GET" });

      const output = metrics.serialize();
      expect(output).toContain("# TYPE http_request_duration_ms histogram");
      expect(output).toContain('http_request_duration_ms_bucket{le="5",method="GET"} 1');
      expect(output).toContain('http_request_duration_ms_bucket{le="10",method="GET"} 1');
      expect(output).toContain('http_request_duration_ms_bucket{le="+Inf",method="GET"} 1');
      expect(output).toContain('http_request_duration_ms_count{method="GET"} 1');
      expect(output).toContain('http_request_duration_ms_sum{method="GET"} 5');
    });
  });

  describe("Gauge", () => {
    it("sets a value", () => {
      metrics.httpActiveConnections.set(42);
      expect(metrics.httpActiveConnections.get()).toBe(42);
    });

    it("increments and decrements", () => {
      metrics.httpActiveConnections.inc();
      metrics.httpActiveConnections.inc();
      metrics.httpActiveConnections.dec();
      expect(metrics.httpActiveConnections.get()).toBe(1);
    });

    it("supports labeled gauges", () => {
      metrics.circuitBreakerState.set(0, { name: "database" });
      metrics.circuitBreakerState.set(2, { name: "api" });

      expect(metrics.circuitBreakerState.get({ name: "database" })).toBe(0);
      expect(metrics.circuitBreakerState.get({ name: "api" })).toBe(2);
    });

    it("serializes to Prometheus text format", () => {
      metrics.httpActiveConnections.set(5);
      const output = metrics.serialize();
      expect(output).toContain("# TYPE http_active_connections gauge");
      expect(output).toContain("http_active_connections 5");
    });
  });

  describe("Full serialization", () => {
    it("includes all metric families", () => {
      const output = metrics.serialize();
      expect(output).toContain("http_requests_total");
      expect(output).toContain("http_request_duration_ms");
      expect(output).toContain("http_active_connections");
      expect(output).toContain("http_errors_total");
      expect(output).toContain("circuit_breaker_state");
      expect(output).toContain("alerts_sent_total");
    });

    it("ends with a newline", () => {
      const output = metrics.serialize();
      expect(output.endsWith("\n")).toBe(true);
    });
  });
});
