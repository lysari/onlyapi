import type { AppConfig } from "../infrastructure/config/config.js";
import { cpus } from "node:os";

// ── ANSI escape sequences (zero dependencies) ──────────────────────────

const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");

const bold = (s: string) => `${esc("1")}${s}${reset}`;
const dim = (s: string) => `${esc("2")}${s}${reset}`;

const cyan = (s: string) => `${esc("36")}${s}${reset}`;
const green = (s: string) => `${esc("32")}${s}${reset}`;
const yellow = (s: string) => `${esc("33")}${s}${reset}`;
const magenta = (s: string) => `${esc("35")}${s}${reset}`;
const blue = (s: string) => `${esc("34")}${s}${reset}`;
const red = (s: string) => `${esc("31")}${s}${reset}`;
const gray = (s: string) => `${esc("90")}${s}${reset}`;
const white = (s: string) => `${esc("97")}${s}${reset}`;

const bgCyan = (s: string) => `${esc("46")}${esc("30")} ${s} ${reset}`;
const bgGreen = (s: string) => `${esc("42")}${esc("30")} ${s} ${reset}`;
const bgYellow = (s: string) => `${esc("43")}${esc("30")} ${s} ${reset}`;
const bgMagenta = (s: string) => `${esc("45")}${esc("97")} ${s} ${reset}`;

// ── Helpers ─────────────────────────────────────────────────────────────

const pad = (s: string, len: number): string => s.padEnd(len);

const formatUptime = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const envBadge = (env: string): string => {
  switch (env) {
    case "production":
      return bgGreen("PRODUCTION");
    case "development":
      return bgCyan("DEVELOPMENT");
    case "test":
      return bgYellow("TEST");
    default:
      return bgMagenta(env.toUpperCase());
  }
};

const methodColor = (method: string): string => {
  switch (method) {
    case "GET":
      return green(bold(pad(method, 7)));
    case "POST":
      return cyan(bold(pad(method, 7)));
    case "PATCH":
      return yellow(bold(pad(method, 7)));
    case "PUT":
      return yellow(bold(pad(method, 7)));
    case "DELETE":
      return red(bold(pad(method, 7)));
    default:
      return white(bold(pad(method, 7)));
  }
};

// ── Route table ─────────────────────────────────────────────────────────

interface RouteInfo {
  readonly method: string;
  readonly path: string;
  readonly auth: boolean;
  readonly description: string;
}

const routes: readonly RouteInfo[] = [
  { method: "GET", path: "/health", auth: false, description: "Shallow health check" },
  { method: "GET", path: "/readiness", auth: false, description: "Deep readiness check" },
  { method: "POST", path: "/api/v1/auth/register", auth: false, description: "Register user" },
  { method: "POST", path: "/api/v1/auth/login", auth: false, description: "Login" },
  { method: "POST", path: "/api/v1/auth/refresh", auth: false, description: "Refresh token" },
  { method: "GET", path: "/api/v1/users/me", auth: true, description: "Get profile" },
  { method: "PATCH", path: "/api/v1/users/me", auth: true, description: "Update profile" },
  { method: "DELETE", path: "/api/v1/users/me", auth: true, description: "Delete account" },
];

// ── ASCII Logo ──────────────────────────────────────────────────────────

const logo = (): string => {
  const lines = [
    `${bold(cyan("  ┌─────────────────────────────────────────┐"))}`,
    `${bold(cyan("  │"))}                                           ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}   ${bold(white("⚡ onlyApi"))}  ${dim(gray("v1.0.0"))}                      ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}   ${dim(gray("Zero-dep enterprise REST API on Bun"))}    ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}                                           ${bold(cyan("│"))}`,
    `${bold(cyan("  └─────────────────────────────────────────┘"))}`,
  ];
  return lines.join("\n");
};

// ── Public API ──────────────────────────────────────────────────────────

interface StartupInfo {
  readonly config: AppConfig;
  readonly bootTimeMs: number;
  readonly isCluster?: boolean;
  readonly workerId?: string;
  readonly workerCount?: number;
}

/**
 * Prints a beautiful startup banner to stdout.
 * Called once after the server is fully initialized.
 */
export const printStartupBanner = (info: StartupInfo): void => {
  const { config, bootTimeMs } = info;
  const isCluster = info.isCluster ?? false;
  const workerId = info.workerId;

  const localUrl = `http://localhost:${config.port}`;
  const networkUrl = `http://${config.host === "0.0.0.0" ? getLocalIp() : config.host}:${config.port}`;

  const lines: string[] = [];

  lines.push("");
  lines.push(logo());
  lines.push("");

  // ── Server info ──
  lines.push(`  ${envBadge(config.env)}  ${dim("booted in")} ${bold(green(formatUptime(bootTimeMs)))}`);
  lines.push("");

  // ── URLs ──
  lines.push(`  ${bold(white("→"))} ${dim("Local:")}    ${bold(cyan(localUrl))}`);
  if (config.host === "0.0.0.0") {
    lines.push(`  ${bold(white("→"))} ${dim("Network:")}  ${bold(cyan(networkUrl))}`);
  }
  lines.push("");

  // ── Process info ──
  lines.push(`  ${gray("├─")} ${dim("PID")}           ${white(String(process.pid))}`);
  lines.push(`  ${gray("├─")} ${dim("Runtime")}       ${magenta(`Bun ${Bun.version}`)}`);
  lines.push(`  ${gray("├─")} ${dim("TypeScript")}    ${blue("strict")} ${dim("(22+ flags)")}`);

  if (isCluster) {
    const count = info.workerCount ?? cpus().length;
    lines.push(`  ${gray("├─")} ${dim("Mode")}          ${yellow(`cluster × ${count} workers`)}`);
    if (workerId !== undefined) {
      lines.push(`  ${gray("├─")} ${dim("Worker")}        ${yellow(`#${workerId}`)}`);
    }
  } else {
    lines.push(`  ${gray("├─")} ${dim("Mode")}          ${green("single process")}`);
  }

  lines.push(`  ${gray("├─")} ${dim("Rate limit")}    ${white(`${config.rateLimit.maxRequests} req/${config.rateLimit.windowMs / 1000}s`)}`);
  lines.push(`  ${gray("└─")} ${dim("Log level")}     ${white(config.log.level)}`);
  lines.push("");

  // ── Routes ──
  lines.push(`  ${bold(white("Routes"))} ${dim(`(${routes.length})`)}`);
  lines.push(`  ${gray("─".repeat(60))}`);

  for (const route of routes) {
    const lock = route.auth ? yellow("🔒") : green("  ");
    const desc = dim(gray(route.description));
    lines.push(`  ${lock} ${methodColor(route.method)} ${pad(route.path, 30)} ${desc}`);
  }

  lines.push(`  ${gray("─".repeat(60))}`);
  lines.push("");

  // ── Help ──
  lines.push(`  ${dim("press")} ${bold(white("Ctrl+C"))} ${dim("to stop")}`);
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
};

/**
 * Prints a compact cluster master banner (no routes, just overview).
 */
export const printClusterBanner = (workerCount: number, cpuCount: number): void => {
  const lines: string[] = [];

  lines.push("");
  lines.push(logo());
  lines.push("");
  lines.push(`  ${bgMagenta("CLUSTER")}  ${dim("spawning")} ${bold(yellow(String(workerCount)))} ${dim("workers on")} ${bold(white(String(cpuCount)))} ${dim("CPU cores")}`);
  lines.push("");
  lines.push(`  ${gray("├─")} ${dim("Master PID")}    ${white(String(process.pid))}`);
  lines.push(`  ${gray("├─")} ${dim("Runtime")}       ${magenta(`Bun ${Bun.version}`)}`);
  lines.push(`  ${gray("└─")} ${dim("SO_REUSEPORT")}  ${green("enabled")} ${dim("(kernel load balancing)")}`);
  lines.push("");
  lines.push(`  ${dim("press")} ${bold(white("Ctrl+C"))} ${dim("to stop all workers")}`);
  lines.push("");

  process.stdout.write(lines.join("\n") + "\n");
};

/**
 * Prints a compact worker ready line (one line per worker).
 */
export const printWorkerReady = (workerId: number, pid: number, port: number): void => {
  process.stdout.write(
    `  ${green("✓")} ${dim("Worker")} ${bold(white(`#${workerId}`))} ${dim("ready")} ${gray(`(PID ${pid}, port ${port})`)}\n`
  );
};

/**
 * Prints a clean shutdown message.
 */
export const printShutdown = (signal: string): void => {
  process.stdout.write(
    `\n  ${yellow("⏻")} ${dim("Received")} ${bold(white(signal))}${dim(", shutting down gracefully…")}\n\n`
  );
};

/**
 * Prints a beautiful config validation error with hints.
 */
export const printConfigError = (errors: Record<string, string[]>): void => {
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${bgMagenta("CONFIG ERROR")}  ${dim("Invalid configuration detected")}`);
  lines.push("");

  for (const [field, messages] of Object.entries(errors)) {
    for (const msg of messages) {
      lines.push(`  ${red("✗")} ${bold(white(field))} ${dim("→")} ${red(msg)}`);
    }
  }

  lines.push("");
  lines.push(`  ${dim("Hint: Copy .env.example to .env and set the required values:")}`);
  lines.push(`  ${cyan("$ cp .env.example .env")}`);
  lines.push("");

  process.stderr.write(lines.join("\n") + "\n");
};

// ── Utilities ───────────────────────────────────────────────────────────

const getLocalIp = (): string => {
  try {
    const nets = require("node:os").networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address as string;
        }
      }
    }
  } catch {
    // ignore
  }
  return "0.0.0.0";
};
