/**
 * Metrics collector port — Prometheus-compatible metrics interface.
 * The core defines WHAT metrics we track; infrastructure decides HOW.
 */

export interface Counter {
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  /** Returns { count, sum, buckets: Map<number, number> } per label set */
  get(labels?: Record<string, string>): HistogramSnapshot | undefined;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(labels?: Record<string, string>, value?: number): void;
  dec(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

export interface HistogramSnapshot {
  readonly count: number;
  readonly sum: number;
  readonly buckets: ReadonlyMap<number, number>;
}

export interface MetricsCollector {
  /** Total HTTP requests */
  readonly httpRequestsTotal: Counter;
  /** HTTP request duration in milliseconds */
  readonly httpRequestDurationMs: Histogram;
  /** Currently active connections */
  readonly httpActiveConnections: Gauge;
  /** Total HTTP errors (4xx + 5xx) */
  readonly httpErrorsTotal: Counter;
  /** Circuit breaker state changes */
  readonly circuitBreakerState: Gauge;
  /** Alert notifications sent */
  readonly alertsSentTotal: Counter;

  /** Serialize all metrics to Prometheus text exposition format */
  serialize(): string;

  /** Reset all metrics (useful for testing) */
  reset(): void;
}
