import type { LogLevel, Logger } from "../../core/ports/logger.js";
import { formatLogEntry } from "../../shared/log-format.js";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export type LogFormat = "pretty" | "json";

/**
 * Format a log entry as structured JSON (for Datadog, ELK, CloudWatch, etc.).
 */
const formatJsonEntry = (level: LogLevel, msg: string, meta: Record<string, unknown>): string => {
  const entry: Record<string, unknown> = {
    level,
    msg,
    time: new Date().toISOString(),
    ...meta,
  };
  return `${JSON.stringify(entry)}\n`;
};

/**
 * Logger — zero dependencies.
 * Supports two modes:
 * - "pretty": ANSI-colored human-readable output (default, for development)
 * - "json": structured JSON lines (for production log aggregators)
 */
export const createLogger = (
  minLevel: LogLevel = "info",
  bindings: Record<string, unknown> = {},
  format: LogFormat = "pretty",
): Logger => {
  const minPriority = LEVEL_PRIORITY[minLevel];

  const formatter = format === "json" ? formatJsonEntry : formatLogEntry;

  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_PRIORITY[level] < minPriority) return;

    const allMeta = { ...bindings, ...meta };
    const line = formatter(level, msg, allMeta);

    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY.warn) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  };

  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
    fatal: (msg, meta) => write("fatal", msg, meta),
    child: (extra) => createLogger(minLevel, { ...bindings, ...extra }, format),
  };
};
