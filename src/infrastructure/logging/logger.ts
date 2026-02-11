import type { Logger, LogLevel } from "../../core/ports/logger.js";
import { formatLogEntry } from "../../shared/log-format.js";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Pretty logger — zero dependencies.
 * Writes beautiful ANSI-colored output to stdout (info/debug) and stderr (warn/error/fatal).
 * Structured enough for machine parsing, beautiful enough for humans.
 */
export const createLogger = (
  minLevel: LogLevel = "info",
  bindings: Record<string, unknown> = {},
): Logger => {
  const minPriority = LEVEL_PRIORITY[minLevel];

  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_PRIORITY[level] < minPriority) return;

    const allMeta = { ...bindings, ...meta };
    const line = formatLogEntry(level, msg, allMeta);

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
    child: (extra) => createLogger(minLevel, { ...bindings, ...extra }),
  };
};
