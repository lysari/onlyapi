/**
 * `onlyapi init <project-name>` — scaffold a new onlyApi project.
 *
 * Modes:
 *   onlyapi init <name>        → Minimal ~20-file project (inline template)
 *   onlyapi init <name> --full → Full enterprise project (cloned from GitHub)
 *
 * Minimal template includes:
 *   - Health check, Auth (register/login/logout), User profile
 *   - SQLite (zero-config), JWT, CORS, rate limiting
 *   - Startup banner, colored request logging, router
 *   - Dockerfile, tests, README
 *
 * Full template includes everything above plus:
 *   - Clean architecture (core/application/infrastructure/presentation)
 *   - Multi-database (SQLite, PostgreSQL, MSSQL)
 *   - OAuth (Google, GitHub), TOTP/2FA, API keys
 *   - Cluster mode, job queue, circuit breaker, retry
 *   - Prometheus metrics, OpenAPI docs, WebSocket, SSE
 *   - Rate limiting, audit log, account lockout, i18n
 *   - Redis cache, webhook system, distributed tracing
 *   - 350+ tests, load test harness
 *
 * Steps:
 *  1. Validate project name
 *  2. Create project directory
 *  3. Generate files (inline) or clone from GitHub (--full)
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
  yellow,
} from "../ui.js";

// ── Constants ───────────────────────────────────────────────────────────

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const GITHUB_REPO = "https://github.com/lysari/onlyapi.git";

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
  let projectName = args.find((a) => !a.startsWith("-")) ?? "";
  const useCurrentDir = args.includes("--cwd") || args.includes(".");
  const fullMode = args.includes("--full") || args.includes("-f");

  if (fullMode) {
    log(`  ${bold(yellow("FULL"))} ${dim("Enterprise template selected")}`);
    blank();
  }

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

  const name = projectName === "." ? "my-api" : projectName;

  if (fullMode) {
    await scaffoldFull(name, targetDir, projectName);
  } else {
    await scaffoldMinimal(name, targetDir, projectName);
  }

  // ── Generate .env with secure secret ──
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

  // ── Install dependencies ──
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

  // ── Initialize git repo ──
  const hasGit = await hasCommand("git");
  if (hasGit) {
    const gitDir = join(targetDir, ".git");
    if (existsSync(gitDir)) {
      // Full mode: already has .git from clone, remove and reinit
      await exec(["rm", "-rf", ".git"], targetDir);
    }
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

  if (fullMode) {
    printFullBanner(name, projectName);
  } else {
    printMinimalBanner(name, projectName);
  }
};

// ── Scaffold: Minimal ─────────────────────────────────────────────────

const scaffoldMinimal = async (
  name: string,
  targetDir: string,
  projectName: string,
): Promise<void> => {
  if (projectName !== ".") {
    mkdirSync(targetDir, { recursive: true });
    step(`Created directory ${bold(cyan(projectName))}`);
  }

  const spinner = createSpinner("Generating project files...");
  spinner.start();

  const files = generateTemplate(name);

  for (const file of files) {
    const filePath = join(targetDir, file.path);
    const fileDir = dirname(filePath);
    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, file.content, "utf-8");
  }

  spinner.stop(`Generated ${bold(cyan(String(files.length)))} files`);
};

// ── Scaffold: Full ────────────────────────────────────────────────────

const FULL_REMOVE = [
  "src/cli",
  "dist",
  "bench",
  ".github",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "bunfig.toml",
];

const scaffoldFull = async (
  name: string,
  targetDir: string,
  _projectName: string,
): Promise<void> => {
  const spinner = createSpinner("Cloning onlyApi repository...");
  spinner.start();

  // Clone into target dir
  const { exitCode: cloneExit, stderr: cloneErr } = await exec([
    "git",
    "clone",
    "--depth",
    "1",
    GITHUB_REPO,
    targetDir,
  ]);

  if (cloneExit !== 0) {
    spinner.stop();
    error("Failed to clone repository:");
    log(`  ${dim(cloneErr)}`);
    blank();
    info("Make sure you have git installed and internet access.");
    process.exit(1);
  }

  spinner.stop("Cloned repository");

  // Remove CLI / framework internals — this is the user's project now
  const cleanSpinner = createSpinner("Cleaning up framework files...");
  cleanSpinner.start();

  let removed = 0;
  for (const path of FULL_REMOVE) {
    const fullPath = join(targetDir, path);
    if (existsSync(fullPath)) {
      await exec(["rm", "-rf", fullPath]);
      removed++;
    }
  }

  // Count total source files
  const srcFiles = await Array.fromAsync(new Bun.Glob("src/**/*.ts").scan({ cwd: targetDir }));
  const testFiles = await Array.fromAsync(new Bun.Glob("tests/**/*.ts").scan({ cwd: targetDir }));

  cleanSpinner.stop(
    `Cleaned up — ${bold(cyan(String(srcFiles.length)))} source files, ${bold(cyan(String(testFiles.length)))} tests`,
  );

  // Customize package.json
  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await Bun.file(pkgPath).text());
      pkg.name = name;
      pkg.version = "0.1.0";
      pkg.description = `${name} — built with onlyApi`;
      pkg.private = true;
      // Remove CLI-specific fields
      pkg.bin = undefined;
      pkg.files = undefined;
      pkg.publishConfig = undefined;
      pkg.repository = undefined;
      pkg.bugs = undefined;
      pkg.homepage = undefined;
      pkg.keywords = undefined;
      pkg.author = undefined;
      // Remove CLI scripts
      if (pkg.scripts) {
        const {
          cli,
          "build:cli": _bc,
          prepublishOnly,
          create,
          "upgrade:project": _up,
          ...keep
        } = pkg.scripts;
        pkg.scripts = keep;
      }
      // Serialize without undefined keys
      const cleaned = JSON.parse(JSON.stringify(pkg));
      await Bun.write(pkgPath, `${JSON.stringify(cleaned, null, 2)}\n`);
      step(`Customized ${bold(cyan("package.json"))} for ${bold(white(name))}`);
    } catch {
      warn("Could not customize package.json");
    }
  }

  // Patch hardcoded version in startup banner
  const cliTsPath = join(targetDir, "src", "shared", "cli.ts");
  if (existsSync(cliTsPath)) {
    try {
      const cliTs = await Bun.file(cliTsPath).text();
      const patched = cliTs.replace(/v\d+\.\d+\.\d+/, "v0.1.0");
      await Bun.write(cliTsPath, patched);
    } catch {
      /* best-effort */
    }
  }
};

// ── Banner: Minimal ───────────────────────────────────────────────────

const printMinimalBanner = (name: string, projectName: string): void => {
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

// ── Banner: Full ──────────────────────────────────────────────────────

const printFullBanner = (name: string, projectName: string): void => {
  section("Architecture");
  blank();
  const tree = [
    `${bold(cyan(name))}/`,
    "├── src/",
    `│   ├── main.ts                  ${dim("← entry + DI wiring")}`,
    `│   ├── cluster.ts               ${dim("← multi-core cluster mode")}`,
    "│   ├── core/",
    `│   │   ├── entities/            ${dim("← domain models")}`,
    `│   │   ├── errors/              ${dim("← typed error hierarchy")}`,
    `│   │   ├── ports/               ${dim("← interfaces (23 ports)")}`,
    `│   │   └── types/               ${dim("← Result, Brand, Pagination")}`,
    "│   ├── application/",
    `│   │   ├── dtos/                ${dim("← Zod schemas")}`,
    `│   │   └── services/            ${dim("← business logic")}`,
    "│   ├── infrastructure/",
    `│   │   ├── database/            ${dim("← SQLite + Postgres + MSSQL")}`,
    `│   │   ├── security/            ${dim("← auth, TOTP, lockout")}`,
    `│   │   ├── cache/               ${dim("← in-memory + Redis")}`,
    `│   │   ├── events/              ${dim("← event bus + webhooks")}`,
    `│   │   ├── jobs/                ${dim("← background job queue")}`,
    `│   │   ├── metrics/             ${dim("← Prometheus")}`,
    `│   │   ├── oauth/               ${dim("← Google + GitHub")}`,
    `│   │   ├── resilience/          ${dim("← circuit breaker + retry")}`,
    `│   │   ├── tracing/             ${dim("← distributed tracing")}`,
    `│   │   └── logging/             ${dim("← structured logger")}`,
    "│   ├── presentation/",
    `│   │   ├── server.ts            ${dim("← HTTP server")}`,
    `│   │   ├── routes/              ${dim("← router (17 routes)")}`,
    `│   │   ├── handlers/            ${dim("← request handlers")}`,
    `│   │   ├── middleware/           ${dim("← auth, CORS, rate limit...")}`,
    `│   │   └── i18n/                ${dim("← internationalization")}`,
    "│   └── shared/",
    `│       ├── cli.ts               ${dim("← startup banner")}`,
    `│       └── log-format.ts        ${dim("← colored access logs")}`,
    "├── tests/",
    `│   ├── unit/                    ${dim("← 30+ unit test files")}`,
    `│   ├── integration/             ${dim("← server integration tests")}`,
    `│   └── e2e/                     ${dim("← end-to-end journey")}`,
    "├── Dockerfile",
    `├── .env                         ${dim("← auto-generated")}`,
    "└── package.json",
  ];
  for (const line of tree) {
    log(`  ${line}`);
  }
  blank();

  section("Features included");
  blank();
  const features = [
    ["Authentication", "JWT, refresh tokens, OAuth (Google/GitHub), TOTP/2FA"],
    ["Database", "SQLite (default), PostgreSQL, MSSQL — migration runner"],
    ["Security", "Argon2id, password policy, account lockout, audit log"],
    ["API", "OpenAPI /docs, Prometheus /metrics, API keys"],
    ["Realtime", "WebSocket, Server-Sent Events (SSE)"],
    ["Resilience", "Circuit breaker, retry, rate limiting, caching"],
    ["Ops", "Cluster mode, job queue, webhooks, distributed tracing"],
    ["DX", "i18n, 350+ tests, load test harness, hot-reload"],
  ];
  const maxLabel = Math.max(...features.map(([l]) => (l ?? "").length));
  for (const [label = "", desc = ""] of features) {
    log(`  ${bold(green(label.padEnd(maxLabel + 2)))} ${dim(desc)}`);
  }
  blank();

  section("Next steps");
  blank();
  const cdCmd = projectName !== "." ? `cd ${projectName}` : null;
  const steps = [
    ...(cdCmd ? [cdCmd] : []),
    "bun run dev              # Start dev server (hot-reload)",
    "bun run start:cluster    # Start in cluster mode",
    "bun test                 # Run 350+ tests",
    "bun run check            # Type-check",
  ];
  for (const s of steps) {
    log(`  ${dim("$")} ${bold(cyan(s))}`);
  }
  blank();

  section("Key endpoints");
  blank();
  log(`  ${dim("GET")}    /health                  ${dim("← health check + dependencies")}`);
  log(`  ${dim("GET")}    /docs                    ${dim("← OpenAPI documentation")}`);
  log(`  ${dim("GET")}    /metrics                 ${dim("← Prometheus metrics")}`);
  log(`  ${dim("POST")}   /api/v1/auth/register    ${dim("← create account")}`);
  log(`  ${dim("POST")}   /api/v1/auth/login       ${dim("← get JWT + refresh token")}`);
  log(`  ${dim("POST")}   /api/v1/auth/refresh     ${dim("← rotate refresh token")}`);
  log(`  ${dim("POST")}   /api/v1/auth/totp/*      ${dim("← 2FA setup/verify")}   ${dim("🔒")}`);
  log(`  ${dim("GET")}    /api/v1/users/me         ${dim("← get profile")}        ${dim("🔒")}`);
  log(`  ${dim("GET")}    /api/v1/admin/users      ${dim("← list all users")}     ${dim("🔒")}`);
  log(`  ${dim("POST")}   /api/v1/api-keys         ${dim("← create API key")}     ${dim("🔒")}`);
  log(`  ${dim("GET")}    /api/v1/events           ${dim("← SSE stream")}         ${dim("🔒")}`);
  log(`  ${dim("WS")}     /ws                      ${dim("← WebSocket")}`);
  blank();

  log(
    `  ${dim("...and")} ${bold(white("17"))} ${dim("routes total — see")} ${cyan("src/presentation/routes/router.ts")}`,
  );
  blank();
  log(`  ${dim("Docs:")}   ${cyan("https://github.com/lysari/onlyapi#readme")}`);
  log(`  ${dim("Issues:")} ${cyan("https://github.com/lysari/onlyapi/issues")}`);
  blank();
  log(`  ${dim("Happy hacking!")} ${icons.bolt}`);
  blank();
};
