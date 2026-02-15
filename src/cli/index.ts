#!/usr/bin/env bun

/**
 * onlyApi CLI — developer tooling for scaffolding and upgrading projects.
 *
 * Usage:
 *   onlyapi init <project-name>   Create a new project
 *   onlyapi upgrade               Upgrade current project
 *   onlyapi version               Show version
 *   onlyapi help                  Show help
 */

import { helpCommand } from "./commands/help.js";
import { initCommand } from "./commands/init.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { blank, bold, cyan, dim, error, log, white } from "./ui.js";

// ── Version ─────────────────────────────────────────────────────────────

const VERSION = "1.5.0";

// ── Arg parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase() ?? "";
const commandArgs = args.slice(1);

// ── Route command ───────────────────────────────────────────────────────

const run = async (): Promise<void> => {
  try {
    switch (command) {
      case "init":
      case "create":
      case "new":
        await initCommand(commandArgs, VERSION);
        break;

      case "upgrade":
      case "update":
        await upgradeCommand(commandArgs, VERSION);
        break;

      case "version":
      case "-v":
      case "--version":
        log(`onlyapi v${VERSION}`);
        break;

      case "help":
      case "-h":
      case "--help":
        helpCommand(VERSION);
        break;

      case "":
        helpCommand(VERSION);
        break;

      default:
        blank();
        error(`Unknown command: ${bold(white(command))}`);
        blank();
        log(`  ${dim("Run")} ${cyan("onlyapi help")} ${dim("to see available commands.")}`);
        blank();
        process.exit(1);
    }
  } catch (e) {
    blank();
    error(e instanceof Error ? e.message : String(e));
    blank();
    process.exit(1);
  }
};

run();
