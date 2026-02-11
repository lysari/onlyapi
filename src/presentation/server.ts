import type { AppConfig } from "../infrastructure/config/config.js";
import type { Logger } from "../core/ports/logger.js";
import type { Router } from "./routes/router.js";
import type { RequestContext } from "./context.js";
import { brand } from "../core/types/brand.js";
import { generateId } from "../shared/utils/id.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { formatAccessLog, formatRateLimitLog, formatCorsRejectLog } from "../shared/log-format.js";

interface ServerDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly router: Router;
}

/**
 * Extract pathname from a full URL string WITHOUT allocating a URL object.
 * `new URL()` is one of the most expensive ops per-request (~2-4µs).
 * This does it in ~50ns with pure string slicing.
 */
const extractPath = (url: string): string => {
  // url format: "http://host:port/path?query"
  // Find the third '/' which starts the pathname
  const start = url.indexOf("/", url.indexOf("//") + 2);
  if (start === -1) return "/";
  const qIdx = url.indexOf("?", start);
  return qIdx === -1 ? url.substring(start) : url.substring(start, qIdx);
};

export const createServer = (deps: ServerDeps) => {
  const { config, logger, router } = deps;

  // ── Pre-compute EVERYTHING possible at boot, not per-request ──

  /** Frozen security header entries — computed once */
  const secHeaders = securityHeaders(config);
  const secHeaderEntries: ReadonlyArray<readonly [string, string]> = Object.freeze(
    Object.entries(secHeaders),
  );

  /** Pre-computed CORS headers for wildcard origin mode (most common) */
  const isWildcardCors = config.cors.origins.includes("*");
  const allowedOriginSet = new Set(config.cors.origins);

  /** Frozen CORS headers template */
  const corsBase: ReadonlyArray<readonly [string, string]> = Object.freeze([
    ["Access-Control-Allow-Credentials", "true"],
    ["Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"],
    ["Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id"],
    ["Access-Control-Max-Age", "86400"],
    ["Vary", "Origin"],
  ]);

  /** Pre-built 204 preflight headers (fully static — zero alloc on preflight) */
  const preflightBaseHeaders = new Headers();
  preflightBaseHeaders.set("Access-Control-Allow-Credentials", "true");
  preflightBaseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  preflightBaseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
  preflightBaseHeaders.set("Access-Control-Max-Age", "86400");
  preflightBaseHeaders.set("Vary", "Origin");
  for (const [k, v] of secHeaderEntries) preflightBaseHeaders.set(k, v);

  /** Rate limit config cached as locals */
  const rlWindowMs = config.rateLimit.windowMs;
  const rlMax = config.rateLimit.maxRequests;
  const rlMaxStr = String(rlMax);

  /** Pre-serialized error responses (allocated once, reused forever) */
  const rateLimitedBody = JSON.stringify({
    error: { code: "RATE_LIMITED", message: "Too many requests" },
  });

  const internalErrorBody = JSON.stringify({
    error: { code: "INTERNAL", message: "Internal server error" },
  });

  // ── Rate limiter inlined for zero function-call overhead ──
  const rlStore = new Map<string, { count: number; resetAt: number }>();
  let lastPrune = 0;

  // ── Batched async logger — accumulate log entries, flush in bulk ──
  // In production: batches to avoid per-request stdout syscall (the #1 bottleneck in benchmarks)
  // In development: writes immediately so logs appear instantly in the terminal
  let logBuffer: string[] = [];
  let logFlushScheduled = false;
  const isDev = config.env !== "production";
  const LOG_FLUSH_INTERVAL_MS = 100; // flush every 100ms (production only)

  const flushLogs = (): void => {
    if (logBuffer.length === 0) {
      logFlushScheduled = false;
      return;
    }
    const batch = logBuffer;
    logBuffer = [];
    logFlushScheduled = false;

    // Single write syscall for all accumulated entries
    process.stdout.write(batch.join(""));
  };

  /** Write a log line — immediate in dev, batched in production */
  const writeLog = (line: string): void => {
    if (isDev) {
      // console.log ensures immediate, unbuffered output in Bun.serve handlers
      const trimmed = line.endsWith("\n") ? line.slice(0, -1) : line;
      console.log(trimmed);
      return;
    }
    logBuffer.push(line);
    if (!logFlushScheduled) {
      logFlushScheduled = true;
      setTimeout(flushLogs, LOG_FLUSH_INTERVAL_MS);
    }
  };

  const shouldLog = config.log.level !== "fatal"; // "fatal" = effectively no access log

  // ── Hot path ──

  const handleRequest = async (req: Request, server: ReturnType<typeof Bun.serve>): Promise<Response> => {
    const method = req.method;

    // Fast-path: OPTIONS preflight — skip ALL middleware, near-zero alloc
    if (method === "OPTIONS") {
      const origin = req.headers.get("origin");
      if (origin !== null && (isWildcardCors || allowedOriginSet.has(origin))) {
        const h = new Headers(preflightBaseHeaders);
        h.set("Access-Control-Allow-Origin", origin);
        return new Response(null, { status: 204, headers: h });
      }
      // Rejected CORS preflight
      if (shouldLog) {
        const rejOrigin = req.headers.get("origin") ?? "none";
        writeLog(formatCorsRejectLog(rejOrigin));
      }
      return new Response(null, { status: 403 });
    }

    // Extract path WITHOUT new URL() — ~12x faster
    const path = extractPath(req.url);

    // Generate or reuse request id
    const requestId = req.headers.get("x-request-id") ?? generateId();

    // Inline rate limit check — avoid function call + Result allocation
    const ip = server.requestIP(req)?.address ?? "0";
    const now = Date.now();

    // Prune at most once per minute
    if (now - lastPrune > 60_000) {
      lastPrune = now;
      for (const [key, entry] of rlStore) {
        if (entry.resetAt <= now) rlStore.delete(key);
      }
    }

    let rlEntry = rlStore.get(ip);
    if (!rlEntry || rlEntry.resetAt <= now) {
      rlEntry = { count: 1, resetAt: now + rlWindowMs };
      rlStore.set(ip, rlEntry);
    } else {
      rlEntry.count++;
    }

    if (rlEntry.count > rlMax) {
      // Batched rate-limit warning — avoids per-hit syscall
      if (shouldLog) {
        writeLog(formatRateLimitLog(ip, rlEntry.count));
      }

      const h = new Headers();
      h.set("Content-Type", "application/json");
      h.set("X-Request-Id", requestId);
      h.set("X-RateLimit-Limit", rlMaxStr);
      h.set("X-RateLimit-Remaining", "0");
      h.set("X-RateLimit-Reset", String(Math.ceil(rlEntry.resetAt / 1000)));
      h.set("Retry-After", String(Math.ceil((rlEntry.resetAt - now) / 1000)));
      for (const [k, v] of secHeaderEntries) h.set(k, v);
      return new Response(rateLimitedBody, { status: 429, headers: h });
    }

    // ── Route & handle ──
    const ctx: RequestContext = {
      requestId: brand<string, "RequestId">(requestId),
      startTime: shouldLog ? performance.now() : 0,
      ip,
      method,
      path,
    };

    let response: Response;
    try {
      response = await router.handle(req, ctx, path);
    } catch (e: unknown) {
      logger.error("Unhandled error", {
        requestId,
        error: e instanceof Error ? e.message : String(e),
      });
      const h = new Headers();
      h.set("Content-Type", "application/json");
      h.set("X-Request-Id", requestId);
      for (const [k, v] of secHeaderEntries) h.set(k, v);
      return new Response(internalErrorBody, { status: 500, headers: h });
    }

    // ── Append cross-cutting headers to the response ──
    const resHeaders = response.headers;
    resHeaders.set("X-Request-Id", requestId);
    resHeaders.set("X-RateLimit-Limit", rlMaxStr);
    resHeaders.set("X-RateLimit-Remaining", String(rlMax - rlEntry.count));
    resHeaders.set("X-RateLimit-Reset", String(Math.ceil(rlEntry.resetAt / 1000)));

    for (const [k, v] of secHeaderEntries) resHeaders.set(k, v);

    // CORS headers (only if origin present)
    const origin = req.headers.get("origin");
    if (origin !== null && (isWildcardCors || allowedOriginSet.has(origin))) {
      resHeaders.set("Access-Control-Allow-Origin", origin);
      for (const [k, v] of corsBase) resHeaders.set(k, v);
    }

    // Access log — immediate in dev, batched in production
    if (shouldLog) {
      const durationMs = Math.round((performance.now() - ctx.startTime) * 100) / 100;
      writeLog(formatAccessLog(method, path, response.status, durationMs, ip, requestId));
    }

    return response;
  };

  return {
    start() {
      const server = Bun.serve({
        port: config.port,
        hostname: config.host,
        fetch: handleRequest,
        reusePort: true, // Enables SO_REUSEPORT — critical for multi-process scaling

        // Limits
        maxRequestBodySize: 1_048_576, // 1 MiB
        idleTimeout: 30, // seconds
      });

      // Banner is printed by main.ts / cluster.ts — no duplicate logging here

      // Flush logs on shutdown
      process.on("beforeExit", flushLogs);

      return server;
    },
    /** Force-flush any buffered access logs (call before exit) */
    flush: flushLogs,
  };
};
