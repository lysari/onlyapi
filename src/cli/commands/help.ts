/**
 * `onlyapi help` — display help information.
 */

import {
  blank,
  bold,
  cyan,
  dim,
  gray,
  green,
  log,
  logo,
  white,
  yellow,
} from "../ui.js";

// ── Main ────────────────────────────────────────────────────────────────

export const helpCommand = (version: string): void => {
  blank();
  log(logo(version));
  blank();

  log(`  ${bold(white("USAGE"))}`);
  log(`  ${gray("─".repeat(50))}`);
  log(`  ${dim("$")} ${cyan("onlyapi")} ${green("<command>")} ${dim("[options]")}`);
  blank();

  log(`  ${bold(white("COMMANDS"))}`);
  log(`  ${gray("─".repeat(50))}`);

  const commands = [
    ["init <name>", "Create a new onlyApi project"],
    ["upgrade", "Upgrade current project to latest version"],
    ["version", "Show CLI version"],
    ["help", "Show this help message"],
  ] as const;

  const maxCmd = Math.max(...commands.map(([c]) => c.length));

  for (const [cmd, desc] of commands) {
    log(`  ${green(cmd.padEnd(maxCmd + 2))} ${dim(desc)}`);
  }

  blank();
  log(`  ${bold(white("INIT OPTIONS"))}`);
  log(`  ${gray("─".repeat(50))}`);

  const initOpts = [
    [".", "Initialize in the current directory"],
    ["--cwd", "Same as '.' — use current directory"],
  ] as const;

  const maxOpt = Math.max(...initOpts.map(([o]) => o.length));

  for (const [opt, desc] of initOpts) {
    log(`  ${yellow(opt.padEnd(maxOpt + 2))} ${dim(desc)}`);
  }

  blank();
  log(`  ${bold(white("UPGRADE OPTIONS"))}`);
  log(`  ${gray("─".repeat(50))}`);

  const upgradeOpts = [
    ["--force, -f", "Force upgrade even if on latest version"],
    ["--dry-run", "Preview changes without applying them"],
  ] as const;

  const maxUpOpt = Math.max(...upgradeOpts.map(([o]) => o.length));

  for (const [opt, desc] of upgradeOpts) {
    log(`  ${yellow(opt.padEnd(maxUpOpt + 2))} ${dim(desc)}`);
  }

  blank();
  log(`  ${bold(white("EXAMPLES"))}`);
  log(`  ${gray("─".repeat(50))}`);

  const examples = [
    ["onlyapi init my-api", "Create project in ./my-api"],
    ["onlyapi init .", "Initialize in current directory"],
    ["onlyapi upgrade", "Upgrade to latest version"],
    ["onlyapi upgrade --dry-run", "Preview upgrade without changes"],
    ["onlyapi upgrade --force", "Force re-apply latest version"],
  ] as const;

  for (const [cmd, desc] of examples) {
    log(`  ${dim("$")} ${cyan(cmd)}`);
    log(`    ${dim(desc)}`);
  }

  blank();
  log(`  ${dim("Docs:")}   ${cyan("https://github.com/lysari/onlyapi#readme")}`);
  log(`  ${dim("Issues:")} ${cyan("https://github.com/lysari/onlyapi/issues")}`);
  blank();
};
