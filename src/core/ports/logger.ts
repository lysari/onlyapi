/**
 * Port: Logger — structured, level-based logging contract.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly requestId?: string | undefined;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  fatal(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}
