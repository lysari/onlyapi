/**
 * Prometheus-compatible metrics collector — zero dependencies.
 *
 * Implements counters, histograms, and gauges with label support.
 * Serializes to Prometheus text exposition format (v0.0.4).
 */

import type {
  Counter,
  Gauge,
  Histogram,
  HistogramSnapshot,
  MetricsCollector,
} from "../../core/ports/metrics.js";

// ── Label key serialization ──

const labelKey = (labels?: Record<string, string>): string => {
  if (!labels) return "";
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}="${v}"`).join(",");
};

const formatLabels = (key: string): string => (key ? `{${key}}` : "");

// ── Counter implementation ──

const createCounter = (name: string, help: string): Counter & { serialize(): string } => {
  const values = new Map<string, number>();

  return {
    inc(labels?: Record<string, string>, value = 1) {
      const key = labelKey(labels);
      values.set(key, (values.get(key) ?? 0) + value);
    },
    get(labels?: Record<string, string>): number {
      return values.get(labelKey(labels)) ?? 0;
    },
    serialize(): string {
      const lines: string[] = [];
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const [key, value] of values) {
        lines.push(`${name}${formatLabels(key)} ${value}`);
      }
      // If no values recorded, emit a zero line
      if (values.size === 0) {
        lines.push(`${name} 0`);
      }
      return lines.join("\n");
    },
  };
};

// ── Histogram implementation ──

/** Default Prometheus-style buckets (in ms for latency) */
const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface HistogramData {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

const createHistogram = (
  name: string,
  help: string,
  buckets: readonly number[] = DEFAULT_BUCKETS,
): Histogram & { serialize(): string } => {
  const data = new Map<string, HistogramData>();

  const getOrCreate = (key: string): HistogramData => {
    let entry = data.get(key);
    if (!entry) {
      entry = {
        count: 0,
        sum: 0,
        buckets: new Map(buckets.map((b) => [b, 0])),
      };
      data.set(key, entry);
    }
    return entry;
  };

  return {
    observe(value: number, labels?: Record<string, string>) {
      const key = labelKey(labels);
      const entry = getOrCreate(key);
      entry.count++;
      entry.sum += value;
      for (const bound of buckets) {
        if (value <= bound) {
          entry.buckets.set(bound, (entry.buckets.get(bound) ?? 0) + 1);
        }
      }
    },
    get(labels?: Record<string, string>): HistogramSnapshot | undefined {
      const entry = data.get(labelKey(labels));
      if (!entry) return undefined;
      return {
        count: entry.count,
        sum: entry.sum,
        buckets: new Map(entry.buckets),
      };
    },
    serialize(): string {
      const lines: string[] = [];
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} histogram`);

      for (const [key, entry] of data) {
        const lbl = key ? `,${key}` : "";
        for (const bound of buckets) {
          const bucketCount = entry.buckets.get(bound) ?? 0;
          lines.push(`${name}_bucket{le="${bound}"${lbl}} ${bucketCount}`);
        }
        lines.push(`${name}_bucket{le="+Inf"${lbl}} ${entry.count}`);
        lines.push(`${name}_sum${formatLabels(key)} ${entry.sum}`);
        lines.push(`${name}_count${formatLabels(key)} ${entry.count}`);
      }

      if (data.size === 0) {
        // Emit empty buckets
        for (const bound of buckets) {
          lines.push(`${name}_bucket{le="${bound}"} 0`);
        }
        lines.push(`${name}_bucket{le="+Inf"} 0`);
        lines.push(`${name}_sum 0`);
        lines.push(`${name}_count 0`);
      }

      return lines.join("\n");
    },
  };
};

// ── Gauge implementation ──

const createGauge = (name: string, help: string): Gauge & { serialize(): string } => {
  const values = new Map<string, number>();

  return {
    set(value: number, labels?: Record<string, string>) {
      values.set(labelKey(labels), value);
    },
    inc(labels?: Record<string, string>, value = 1) {
      const key = labelKey(labels);
      values.set(key, (values.get(key) ?? 0) + value);
    },
    dec(labels?: Record<string, string>, value = 1) {
      const key = labelKey(labels);
      values.set(key, (values.get(key) ?? 0) - value);
    },
    get(labels?: Record<string, string>): number {
      return values.get(labelKey(labels)) ?? 0;
    },
    serialize(): string {
      const lines: string[] = [];
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const [key, value] of values) {
        lines.push(`${name}${formatLabels(key)} ${value}`);
      }
      if (values.size === 0) {
        lines.push(`${name} 0`);
      }
      return lines.join("\n");
    },
  };
};

// ── Metrics collector factory ──

export const createMetricsCollector = (): MetricsCollector => {
  const httpRequestsTotal = createCounter("http_requests_total", "Total number of HTTP requests");
  const httpRequestDurationMs = createHistogram(
    "http_request_duration_ms",
    "HTTP request duration in milliseconds",
  );
  const httpActiveConnections = createGauge(
    "http_active_connections",
    "Number of currently active HTTP connections",
  );
  const httpErrorsTotal = createCounter(
    "http_errors_total",
    "Total number of HTTP error responses (4xx + 5xx)",
  );
  const circuitBreakerState = createGauge(
    "circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
  );
  const alertsSentTotal = createCounter(
    "alerts_sent_total",
    "Total number of alert notifications sent",
  );

  return {
    httpRequestsTotal,
    httpRequestDurationMs,
    httpActiveConnections,
    httpErrorsTotal,
    circuitBreakerState,
    alertsSentTotal,

    serialize(): string {
      const sections = [
        httpRequestsTotal.serialize(),
        httpRequestDurationMs.serialize(),
        httpActiveConnections.serialize(),
        httpErrorsTotal.serialize(),
        circuitBreakerState.serialize(),
        alertsSentTotal.serialize(),
      ];
      return `${sections.join("\n\n")}\n`;
    },

    reset(): void {
      // Re-create would be cleanest but we just reset the underlying maps
      // For simplicity, we expose reset through the collector
      const collector = createMetricsCollector();
      Object.assign(httpRequestsTotal, collector.httpRequestsTotal);
      Object.assign(httpRequestDurationMs, collector.httpRequestDurationMs);
      Object.assign(httpActiveConnections, collector.httpActiveConnections);
      Object.assign(httpErrorsTotal, collector.httpErrorsTotal);
      Object.assign(circuitBreakerState, collector.circuitBreakerState);
      Object.assign(alertsSentTotal, collector.alertsSentTotal);
    },
  };
};
