/**
 * `onlyapi init <project-name>` — scaffold a new onlyApi project.
 *
 * Generates a minimal ~15-file project with:
 *   - Health check, Auth (register/login/logout), User profile
 *   - SQLite (zero-config), JWT, CORS, rate limiting
 *   - Dockerfile, tests, README
 *
 * Steps:
 *  1. Validate project name
 *  2. Create project directory
 *  3. Generate template files (no git clone!)
 *  4. Install dependencies via `bun install`
 *  5. Generate secure JWT_SECRET in .env
 *  6. Initialize git repo
 *  7. Print success banner
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { generateTemplate } from "../template.js";
import {
  blank,
  bold,
  confirm,
  createSpinner,
  cyan,
  dim,
  error,
  formatDuration,
  green,
  icons,
  info,
  log,
  logo,
  prompt,
  randomSecret,
  section,
  step,
  warn,
  white,
} from "../ui.js";

// ── Constants ───────────────────────────────────────────────────────────

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// ── Helpers ─────────────────────────────────────────────────────────────

const validateProjectName = (name: string): string | null => {
  if (!name) return "Project name is required.";
  if (!VALID_NAME_RE.test(name))
    return "Project name can only contain letters, numbers, hyphens, and underscores.";
  if (name.length > 214) return "Project name is too long (max 214 chars).";
  return null;
};

const exec = async (
  cmd: string[],
  cwd: string = process.cwd(),
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
};

const hasCommand = async (cmd: string): Promise<boolean> => {
  try {
    const { exitCode } = await exec(["which", cmd]);
    return exitCode === 0;
  } catch {
    return false;
  }
};

// ── Main ────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI wizard is inherently branchy
export const initCommand = async (args: string[], version: string): Promise<void> => {
  const startTime = performance.now();

  blank();
  log(logo(version));
  blank();

  // ── Parse args ──
  let projectName = args[0] ?? "";
  const useCurrentDir = args.includes("--cwd") || args.includes(".");

  // Interactive prompt if no name given
  if (!projectName && !useCurrentDir) {
    projectName = await prompt("Project name", "my-api");
  }

  if (useCurrentDir) {
    projectName = ".";
  }

  // Validate name
  if (projectName !== ".") {
    const nameError = validateProjectName(projectName);
    if (nameError) {
      error(nameError);
      process.exit(1);
    }
  }

  const targetDir = projectName === "." ? process.cwd() : resolve(process.cwd(), projectName);

  // ── Check existing directory ──
  if (projectName !== "." && existsSync(targetDir)) {
    const files = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: targetDir }));
    if (files.length > 0) {
      const shouldContinue = await confirm(
        `Directory ${bold(white(projectName))} already exists and is not empty. Continue?`,
        false,
      );
      if (!shouldContinue) {
        info("Aborted.");
        process.exit(0);
      }
    }
  }

  section("Creating project");

  // ── Step 1: Create directory ──
  if (projectName !== ".") {
    mkdirSync(targetDir, { recursive: true });
    step(`Created directory ${bold(cyan(projectName))}`);
  }

  // ── Step 2: Generate template files ──
  const spinner = createSpinner("Generating project files...");
  spinner.start();

  const name = projectName === "." ? "my-api" : projectName;
  const files = generateTemplate(name);

  for (const file of files) {
    const filePath = join(targetDir, file.path);
    const fileDir = dirname(filePath);
    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, file.content, "utf-8");
  }

  spinner.stop(`Generated ${bold(cyan(String(files.length)))} files`);

  // ── Step 3: Generate .env with secure secret ──
  const envExamplePath = join(targetDir, ".env.example");
  const envPath = join(targetDir, ".env");

  if (existsSync(envExamplePath) && !existsSync(envPath)) {
    try {
      let envContent = await Bun.file(envExamplePath).text();
      const secret = randomSecret(64);
      envContent = envContent.replace("change-me-to-a-64-char-random-string", secret);
      await Bun.write(envPath, envContent);
      step(`Generated ${bold(cyan(".env"))} with secure JWT_SECRET`);
    } catch {
      warn("Could not generate .env — copy .env.example manually");
    }
  }

  // ── Step 4: Install dependencies ──
  section("Installing dependencies");

  const installSpinner = createSpinner("Running bun install...");
  installSpinner.start();

  const { exitCode: installExit, stderr: installErr } = await exec(["bun", "install"], targetDir);

  if (installExit !== 0) {
    installSpinner.stop();
    error("Failed to install dependencies:");
    log(`  ${dim(installErr)}`);
    blank();
    info(`Run ${bold(cyan("bun install"))} manually in the project directory.`);
  } else {
    installSpinner.stop("Dependencies installed");
  }

  // ── Step 5: Initialize git repo ──
  const hasGit = await hasCommand("git");
  if (hasGit) {
    await exec(["git", "init"], targetDir);
    await exec(["git", "add", "-A"], targetDir);
    await exec(
      ["git", "commit", "-m", "Initial commit from onlyApi CLI", "--no-verify"],
      targetDir,
    );
    step("Initialized git repository");
  }

  // ── Success banner ──
  const elapsed = performance.now() - startTime;

  blank();
  log(
    `  ${icons.rocket} ${bold(green("Project created successfully!"))} ${dim(`(${formatDuration(elapsed)})`)}`,
  );
  blank();

  // File tree
  section("Project structure");
  blank();
  const tree = [
    `${bold(cyan(name))}/`,
    "├── src/",
    `│   ├── main.ts              ${dim("← entry point")}`,
    `│   ├── config.ts            ${dim("← env config")}`,
    `│   ├── database.ts          ${dim("← SQLite + migrations")}`,
    `│   ├── logger.ts            ${dim("← colored structured logger")}`,
    `│   ├── router.ts            ${dim("← route table + matching")}`,
    `│   ├── server.ts            ${dim("← HTTP server + middleware")}`,
    "│   ├── handlers/",
    `│   │   ├── auth.handler.ts  ${dim("← register/login/logout")}`,
    "│   │   ├── health.handler.ts",
    `│   │   └── user.handler.ts  ${dim("← profile CRUD")}`,
    "│   ├── middleware/",
    `│   │   └── auth.ts          ${dim("← JWT guard")}`,
    "│   ├── services/",
    "│   │   ├── auth.service.ts",
    "│   │   └── user.service.ts",
    "│   └── utils/",
    `│       ├── password.ts      ${dim("← Argon2id")}`,
    `│       ├── token.ts         ${dim("← JWT sign/verify")}`,
    "│       └── response.ts",
    "├── tests/",
    "├── Dockerfile",
    `├── .env                     ${dim("← auto-generated")}`,
    "└── package.json",
  ];
  for (const line of tree) {
    log(`  ${line}`);
  }

  blank();

  // Next steps
  section("Next steps");
  blank();

  const cdCmd = projectName !== "." ? `cd ${projectName}` : null;
  const steps = [
    ...(cdCmd ? [cdCmd] : []),
    "bun run dev          # Start dev server (hot-reload)",
    "bun test             # Run tests",
    "bun run check        # Type-check",
  ];

  for (const s of steps) {
    log(`  ${dim("$")} ${bold(cyan(s))}`);
  }

  blank();

  // Endpoints
  section("API endpoints");
  blank();
  log(`  ${dim("GET")}    /health                ${dim("← health check")}`);
  log(`  ${dim("POST")}   /api/v1/auth/register  ${dim("← create account")}`);
  log(`  ${dim("POST")}   /api/v1/auth/login     ${dim("← get JWT token")}`);
  log(`  ${dim("POST")}   /api/v1/auth/logout    ${dim("← revoke token")}  ${dim("🔒")}`);
  log(`  ${dim("GET")}    /api/v1/users/me       ${dim("← get profile")}   ${dim("🔒")}`);
  log(`  ${dim("PATCH")}  /api/v1/users/me       ${dim("← update profile")} ${dim("🔒")}`);
  log(`  ${dim("DELETE")} /api/v1/users/me       ${dim("← delete account")} ${dim("🔒")}`);
  blank();

  log(`  ${dim("Docs:")}   ${cyan("https://github.com/lysari/onlyapi#readme")}`);
  log(`  ${dim("Issues:")} ${cyan("https://github.com/lysari/onlyapi/issues")}`);
  blank();
  log(`  ${dim("Happy hacking!")} ${icons.bolt}`);
  blank();
};
