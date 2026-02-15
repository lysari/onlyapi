/**
 * CLI UI utilities — zero-dependency ANSI colors, spinner, and prompts.
 * Follows the same style as the server startup banner.
 */

// ── ANSI escape sequences ──────────────────────────────────────────────

const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");

export const bold = (s: string) => `${esc("1")}${s}${reset}`;
export const dim = (s: string) => `${esc("2")}${s}${reset}`;

export const cyan = (s: string) => `${esc("36")}${s}${reset}`;
export const green = (s: string) => `${esc("32")}${s}${reset}`;
export const yellow = (s: string) => `${esc("33")}${s}${reset}`;
export const magenta = (s: string) => `${esc("35")}${s}${reset}`;
export const blue = (s: string) => `${esc("34")}${s}${reset}`;
export const red = (s: string) => `${esc("31")}${s}${reset}`;
export const gray = (s: string) => `${esc("90")}${s}${reset}`;
export const white = (s: string) => `${esc("97")}${s}${reset}`;

export const bgCyan = (s: string) => `${esc("46")}${esc("30")} ${s} ${reset}`;
export const bgGreen = (s: string) => `${esc("42")}${esc("30")} ${s} ${reset}`;
export const bgYellow = (s: string) => `${esc("43")}${esc("30")} ${s} ${reset}`;
export const bgMagenta = (s: string) => `${esc("45")}${esc("97")} ${s} ${reset}`;
export const bgRed = (s: string) => `${esc("41")}${esc("97")} ${s} ${reset}`;

// ── Icons ───────────────────────────────────────────────────────────────

export const icons = {
  success: green("✔"),
  error: red("✗"),
  warning: yellow("⚠"),
  info: cyan("ℹ"),
  arrow: cyan("→"),
  chevron: cyan("›"),
  sparkle: magenta("✦"),
  bolt: yellow("⚡"),
  folder: blue("📁"),
  file: gray("📄"),
  gear: gray("⚙"),
  rocket: magenta("🚀"),
  package: cyan("📦"),
} as const;

// ── Logo ────────────────────────────────────────────────────────────────

export const logo = (version: string): string => {
  const lines = [
    `${bold(cyan("  ┌─────────────────────────────────────────┐"))}`,
    `${bold(cyan("  │"))}                                           ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}   ${bold(white("⚡ onlyApi CLI"))}  ${dim(gray(`v${version}`))}                  ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}   ${dim(gray("Zero-dep enterprise REST API on Bun"))}    ${bold(cyan("│"))}`,
    `${bold(cyan("  │"))}                                           ${bold(cyan("│"))}`,
    `${bold(cyan("  └─────────────────────────────────────────┘"))}`,
  ];
  return lines.join("\n");
};

// ── Output helpers ──────────────────────────────────────────────────────

export const log = (msg: string) => process.stdout.write(`${msg}\n`);
export const blank = () => process.stdout.write("\n");
export const error = (msg: string) => process.stderr.write(`  ${icons.error} ${red(msg)}\n`);
export const warn = (msg: string) => process.stdout.write(`  ${icons.warning} ${yellow(msg)}\n`);
export const info = (msg: string) => process.stdout.write(`  ${icons.info} ${msg}\n`);
export const success = (msg: string) => process.stdout.write(`  ${icons.success} ${green(msg)}\n`);
export const step = (msg: string) => process.stdout.write(`  ${icons.chevron} ${msg}\n`);

// ── Spinner ─────────────────────────────────────────────────────────────

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export interface Spinner {
  start: () => void;
  stop: (finalMsg?: string) => void;
  update: (msg: string) => void;
}

export const createSpinner = (message: string): Spinner => {
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentMsg = message;

  const clear = () => {
    process.stdout.write("\r\x1b[K");
  };

  return {
    start() {
      timer = setInterval(() => {
        clear();
        const icon = spinnerFrames[frame % spinnerFrames.length] ?? "⠋";
        process.stdout.write(`  ${cyan(icon)} ${currentMsg}`);
        frame++;
      }, 80);
    },
    update(msg: string) {
      currentMsg = msg;
    },
    stop(finalMsg?: string) {
      if (timer) clearInterval(timer);
      clear();
      if (finalMsg) {
        process.stdout.write(`  ${icons.success} ${green(finalMsg)}\n`);
      }
    },
  };
};

// ── Prompt (simple stdin reader) ────────────────────────────────────────

export const prompt = async (question: string, defaultValue?: string): Promise<string> => {
  const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : "";
  process.stdout.write(`  ${icons.chevron} ${question}${suffix}: `);

  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();

  const input = value ? new TextDecoder().decode(value).trim() : "";
  return input || defaultValue || "";
};

export const confirm = async (question: string, defaultYes = true): Promise<boolean> => {
  const hint = defaultYes ? `${bold("Y")}/n` : `y/${bold("N")}`;
  process.stdout.write(`  ${icons.chevron} ${question} ${dim(`[${hint}]`)}: `);

  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();

  const input = value ? new TextDecoder().decode(value).trim().toLowerCase() : "";
  if (input === "") return defaultYes;
  return input === "y" || input === "yes";
};

// ── Table helper ────────────────────────────────────────────────────────

export const printKeyValue = (pairs: readonly [string, string][]): void => {
  const maxKey = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    log(`  ${gray("│")} ${dim(key.padEnd(maxKey))}  ${white(value)}`);
  }
};

// ── Section header ──────────────────────────────────────────────────────

export const section = (title: string): void => {
  blank();
  log(`  ${bold(white(title))}`);
  log(`  ${gray("─".repeat(50))}`);
};

// ── Box ─────────────────────────────────────────────────────────────────

export const box = (lines: string[]): void => {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const border = gray("─".repeat(maxLen + 4));

  log(`  ┌${border}┐`);
  for (const line of lines) {
    const padding = " ".repeat(maxLen - stripAnsi(line).length);
    log(`  │  ${line}${padding}  │`);
  }
  log(`  └${border}┘`);
};

// ── Strip ANSI codes for length calculation ─────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape stripping
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

// ── Duration formatter ─────────────────────────────────────────────────

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

// ── Random string generator ────────────────────────────────────────────

export const randomSecret = (length = 64): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};
