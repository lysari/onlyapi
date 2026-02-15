/**
 * W3C Trace Context implementation — zero-dependency OpenTelemetry-compatible tracing.
 *
 * Implements the W3C Trace Context specification:
 *   - Generates trace IDs (128-bit / 32 hex chars)
 *   - Generates span IDs (64-bit / 16 hex chars)
 *   - Parses incoming `traceparent` header
 *   - Propagates trace context in responses
 *
 * Format: `{version}-{traceId}-{parentSpanId}-{flags}`
 * Example: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
 */

const TRACE_ID_LENGTH = 32; // 128-bit → 32 hex chars
const SPAN_ID_LENGTH = 16; // 64-bit  → 16 hex chars
const TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface TraceContext {
  /** 128-bit trace ID (32 hex chars) */
  readonly traceId: string;
  /** 64-bit span ID for this request (16 hex chars) */
  readonly spanId: string;
  /** 64-bit parent span ID from incoming header (16 hex chars, or undefined if root) */
  readonly parentSpanId: string | undefined;
  /** Trace flags (bit 0 = sampled) */
  readonly flags: number;
}

/**
 * Generate a random hex string of the given byte length.
 * Uses crypto.getRandomValues for high-quality randomness.
 */
const randomHex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < byteLength; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounds guaranteed by loop
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
};

/**
 * Parse an incoming `traceparent` header into trace context.
 * Returns undefined if the header is missing, invalid, or all-zero IDs.
 */
export const parseTraceparent = (header: string | null): TraceContext | undefined => {
  if (!header) return undefined;

  const match = TRACEPARENT_REGEX.exec(header.trim().toLowerCase());
  if (!match) return undefined;

  const traceId = match[1] as string;
  const parentSpanId = match[2] as string;
  const flags = Number.parseInt(match[3] as string, 16);

  // Reject all-zero trace or span IDs
  if (traceId === "0".repeat(TRACE_ID_LENGTH)) return undefined;
  if (parentSpanId === "0".repeat(SPAN_ID_LENGTH)) return undefined;

  return {
    traceId,
    spanId: randomHex(8), // new span for this service
    parentSpanId,
    flags,
  };
};

/**
 * Create a new root trace context (no incoming traceparent).
 */
export const createTraceContext = (): TraceContext => ({
  traceId: randomHex(16),
  spanId: randomHex(8),
  parentSpanId: undefined,
  flags: 1, // sampled by default
});

/**
 * Create or propagate trace context from an incoming request.
 */
export const resolveTraceContext = (traceparentHeader: string | null): TraceContext => {
  return parseTraceparent(traceparentHeader) ?? createTraceContext();
};

/**
 * Format trace context into a `traceparent` response header value.
 */
export const formatTraceparent = (ctx: TraceContext): string => {
  const flagsHex = ctx.flags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flagsHex}`;
};
