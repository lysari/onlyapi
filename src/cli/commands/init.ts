/**
 * `onlyapi init <project-name>` — scaffold a new onlyApi project.
 *
 * Steps:
 *  1. Validate project name
 *  2. Create project directory
 *  3. Clone from GitHub (or download tarball as fallback)
 *  4. Clean up git history (.git removed, fresh git init)
 *  5. Install dependencies via `bun install`
 *  6. Generate secure JWT_SECRET
 *  7. Create .env from .env.example
 *  8. Print success banner with next steps
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  blank,
  bold,
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
  randomSecret,
  section,
  step,
  warn,
  white,
  confirm,
  prompt,
} from "../ui.js";

// ── Constants ───────────────────────────────────────────────────────────

const REPO_URL = "https://github.com/lysari/onlyapi.git";
const TARBALL_URL = "https://github.com/lysari/onlyapi/archive/refs/heads/main.tar.gz";
const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// ── Helpers ─────────────────────────────────────────────────────────────

const validateProjectName = (name: string): string | null => {
  if (!name) return "Project name is required.";
  if (!VALID_NAME_RE.test(name)) return "Project name can only contain letters, numbers, hyphens, and underscores.";
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

  // ── Step 2: Clone or download ──
  const hasGit = await hasCommand("git");
  const spinner = createSpinner("Downloading template...");
  spinner.start();

  let cloneSuccess = false;

  if (hasGit) {
    spinner.update("Cloning from GitHub...");
    const { exitCode } = await exec(
      ["git", "clone", "--depth=1", "--single-branch", REPO_URL, projectName === "." ? "." : projectName],
      projectName === "." ? targetDir : process.cwd(),
    );
    cloneSuccess = exitCode === 0;
  }

  if (!cloneSuccess) {
    // Fallback: download tarball
    spinner.update("Downloading release archive...");
    try {
      const response = await fetch(TARBALL_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const tarPath = join(targetDir, "__onlyapi.tar.gz");
      await Bun.write(tarPath, response);

      // Extract
      spinner.update("Extracting...");
      await exec(["tar", "xzf", tarPath, "--strip-components=1"], targetDir);
      rmSync(tarPath, { force: true });
      cloneSuccess = true;
    } catch (e) {
      spinner.stop();
      error(`Failed to download template: ${e instanceof Error ? e.message : String(e)}`);
      error("Please check your network connection and try again.");
      blank();
      info(`You can also clone manually: ${dim(`git clone ${REPO_URL} ${projectName}`)}`);
      process.exit(1);
    }
  }

  spinner.stop("Template downloaded");

  // ── Step 3: Clean up git history ──
  const gitDir = join(targetDir, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true });
  }

  // Initialize fresh git repo
  if (hasGit) {
    await exec(["git", "init"], targetDir);
    step("Initialized fresh git repository");
  }

  // ── Step 4: Update package.json with project name ──
  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkgContent = await Bun.file(pkgPath).text();
      const pkg = JSON.parse(pkgContent);

      if (projectName !== ".") {
        pkg.name = projectName;
      }
      pkg.version = "0.1.0";
      pkg.description = "";
      pkg.author = "";
      delete pkg.repository;
      delete pkg.bugs;
      delete pkg.homepage;

      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      step(`Updated ${bold(cyan("package.json"))}`);
    } catch {
      warn("Could not update package.json — you can edit it manually");
    }
  }

  // ── Step 5: Generate .env ──
  const envExamplePath = join(targetDir, ".env.example");
  const envPath = join(targetDir, ".env");

  if (existsSync(envExamplePath) && !existsSync(envPath)) {
    try {
      let envContent = await Bun.file(envExamplePath).text();
      const secret = randomSecret(64);
      envContent = envContent.replace(
        "change-me-to-a-64-char-random-string",
        secret,
      );
      await Bun.write(envPath, envContent);
      step(`Generated ${bold(cyan(".env"))} with secure JWT_SECRET`);
    } catch {
      warn("Could not generate .env — copy .env.example manually");
    }
  }

  // ── Step 6: Install dependencies ──
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

  // ── Step 7: Initial git commit ──
  if (hasGit) {
    await exec(["git", "add", "-A"], targetDir);
    await exec(["git", "commit", "-m", "Initial commit from onlyApi CLI", "--no-verify"], targetDir);
    step("Created initial commit");
  }

  // ── Success banner ──
  const elapsed = performance.now() - startTime;

  blank();
  log(`  ${icons.rocket} ${bold(green("Project created successfully!"))} ${dim(`(${formatDuration(elapsed)})`)}`);
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
  log(`  ${dim("Docs:")}  ${cyan("https://github.com/lysari/onlyapi#readme")}`);
  log(`  ${dim("Issues:")} ${cyan("https://github.com/lysari/onlyapi/issues")}`);
  blank();
  log(`  ${dim("Happy hacking!")} ${icons.bolt}`);
  blank();
};
