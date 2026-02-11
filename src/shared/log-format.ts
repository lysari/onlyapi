import type { LogLevel } from "../core/ports/logger.js";

// ── ANSI escape sequences ──────────────────────────────────────────────

const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");

const bold = (s: string) => `${esc("1")}${s}${reset}`;
const dim = (s: string) => `${esc("2")}${s}${reset}`;

const cyan = (s: string) => `${esc("36")}${s}${reset}`;
const green = (s: string) => `${esc("32")}${s}${reset}`;
const yellow = (s: string) => `${esc("33")}${s}${reset}`;
const red = (s: string) => `${esc("31")}${s}${reset}`;
const gray = (s: string) => `${esc("90")}${s}${reset}`;
const white = (s: string) => `${esc("97")}${s}${reset}`;

const bgGreen = (s: string) => `${esc("42")}${esc("30")} ${s} ${reset}`;
const bgCyan = (s: string) => `${esc("46")}${esc("30")} ${s} ${reset}`;
const bgYellow = (s: string) => `${esc("43")}${esc("30")} ${s} ${reset}`;
const bgRed = (s: string) => `${esc("41")}${esc("97")} ${s} ${reset}`;

// ── Helpers ─────────────────────────────────────────────────────────────

const timestamp = (): string => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
};

const levelBadge = (level: LogLevel): string => {
  switch (level) {
    case "debug":
      return gray("DBG");
    case "info":
      return green("INF");
    case "warn":
      return yellow("WRN");
    case "error":
      return red("ERR");
    case "fatal":
      return bgRed("FTL");
  }
};

const methodBadge = (method: string): string => {
  switch (method) {
    case "GET":
      return bgGreen("GET");
    case "POST":
      return bgCyan("POST");
    case "PATCH":
      return bgYellow("PATCH");
    case "PUT":
      return bgYellow("PUT");
    case "DELETE":
      return bgRed("DEL");
    case "OPTIONS":
      return gray("OPT");
    default:
      return white(method);
  }
};

const statusColor = (status: number): string => {
  if (status < 300) return bold(green(String(status)));
  if (status < 400) return bold(cyan(String(status)));
  if (status < 500) return bold(yellow(String(status)));
  return bold(red(String(status)));
};

const durationColor = (ms: number): string => {
  if (ms < 1) return green(`${ms}ms`);
  if (ms < 50) return green(`${ms}ms`);
  if (ms < 200) return yellow(`${ms}ms`);
  return red(`${ms}ms`);
};

const formatMeta = (meta: Record<string, unknown>): string => {
  const entries = Object.entries(meta);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${dim(k)}${dim("=")}${white(String(v))}`);
  return ` ${parts.join(" ")}`;
};

// ── Public formatters ───────────────────────────────────────────────────

/**
 * Format a structured log entry (used by the Logger port).
 *
 *   INF 12:34:56.789 Registering user  service=auth email=foo@bar.com
 */
export const formatLogEntry = (
  level: LogLevel,
  msg: string,
  meta: Record<string, unknown>,
): string => {
  const ts = dim(gray(timestamp()));
  const badge = levelBadge(level);
  const metaStr = formatMeta(meta);
  return `  ${badge} ${ts} ${white(msg)}${metaStr}\n`;
};

/**
 * Format an HTTP access log line (used by batched server logger).
 *
 *   ← GET 200 /health 0.34ms  ip=127.0.0.1 rid=abc123
 */
export const formatAccessLog = (
  method: string,
  path: string,
  status: number,
  durationMs: number,
  ip: string,
  requestId: string,
): string => {
  const ts = dim(gray(timestamp()));
  const arrow = dim("←");
  const mBadge = methodBadge(method);
  const st = statusColor(status);
  const dur = durationColor(durationMs);
  const p = white(path);
  const meta = dim(gray(`ip=${ip} rid=${requestId.slice(0, 8)}`));
  return `  ${arrow} ${ts} ${mBadge} ${st} ${p} ${dur}  ${meta}\n`;
};

/**
 * Format a rate-limit warning line.
 *
 *   ⚠ 12:34:56.789 Rate limited  ip=1.2.3.4 hits=152
 */
export const formatRateLimitLog = (ip: string, count: number): string => {
  const ts = dim(gray(timestamp()));
  return `  ${yellow("⚠")} ${ts} ${bold(yellow("Rate limited"))}  ${dim("ip=")}${white(ip)} ${dim("hits=")}${white(String(count))}\n`;
};

/**
 * Format a CORS rejection line.
 *
 *   ✗ 12:34:56.789 CORS rejected  origin=evil.com
 */
export const formatCorsRejectLog = (origin: string): string => {
  const ts = dim(gray(timestamp()));
  return `  ${red("✗")} ${ts} ${bold(red("CORS rejected"))}  ${dim("origin=")}${white(origin)}\n`;
};
