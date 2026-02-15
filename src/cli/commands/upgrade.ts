/**
 * `onlyapi upgrade` — upgrade an existing onlyApi project to the latest version.
 *
 * Steps:
 *  1. Verify we're inside an onlyApi project
 *  2. Read current version from package.json
 *  3. Fetch latest version from GitHub / npm
 *  4. Compare versions
 *  5. If newer, download and apply updates to core files
 *  6. Re-install dependencies
 *  7. Show changelog summary
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
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
  printKeyValue,
  section,
  step,
  success,
  warn,
  yellow,
} from "../ui.js";

// ── Constants ───────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com/repos/lysari/onlyapi";
const TARBALL_URL = (tag: string) =>
  `https://github.com/lysari/onlyapi/archive/refs/tags/${tag}.tar.gz`;
const TARBALL_MAIN_URL = "https://github.com/lysari/onlyapi/archive/refs/heads/main.tar.gz";
const NPM_REGISTRY = "https://registry.npmjs.org/only-api";

/**
 * Files that are safe to upgrade (framework internals).
 * User-modified files like handlers and services are NOT touched.
 */
const UPGRADEABLE_PATHS = [
  "src/core/errors/app-error.ts",
  "src/core/types/brand.ts",
  "src/core/types/result.ts",
  "src/infrastructure/logging/logger.ts",
  "src/infrastructure/security/password-hasher.ts",
  "src/infrastructure/security/token-service.ts",
  "src/presentation/middleware/cors.ts",
  "src/presentation/middleware/rate-limit.ts",
  "src/presentation/middleware/security-headers.ts",
  "src/presentation/server.ts",
  "src/presentation/context.ts",
  "src/shared/cli.ts",
  "src/shared/container.ts",
  "src/shared/utils/id.ts",
  "src/shared/utils/timing-safe.ts",
  "src/shared/log-format.ts",
  "src/cluster.ts",
  "tsconfig.json",
  "biome.json",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────

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

const parseVersion = (v: string): [number, number, number] => {
  const parts = v.replace(/^v/, "").split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
};

const isNewer = (latest: string, current: string): boolean => {
  const [lMaj, lMin, lPatch] = parseVersion(latest);
  const [cMaj, cMin, cPatch] = parseVersion(current);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
};

const fetchLatestVersion = async (): Promise<string | null> => {
  // Try GitHub releases first
  try {
    const res = await fetch(`${GITHUB_API}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { tag_name: string };
      return data.tag_name.replace(/^v/, "");
    }
  } catch {
    // fall through
  }

  // Try GitHub tags
  try {
    const res = await fetch(`${GITHUB_API}/tags?per_page=1`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (res.ok) {
      const tags = (await res.json()) as { name: string }[];
      if (tags.length > 0) {
        const first = tags[0];
        return first ? first.name.replace(/^v/, "") : null;
      }
    }
  } catch {
    // fall through
  }

  // Try npm registry
  try {
    const res = await fetch(NPM_REGISTRY);
    if (res.ok) {
      const data = (await res.json()) as { "dist-tags": { latest: string } };
      return data["dist-tags"].latest;
    }
  } catch {
    // fall through
  }

  return null;
};

// ── Main ────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI upgrade wizard is inherently branchy
export const upgradeCommand = async (args: string[], version: string): Promise<void> => {
  const startTime = performance.now();
  const projectDir = resolve(process.cwd());

  blank();
  log(logo(version));
  blank();

  // ── Verify onlyApi project ──
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    error("No package.json found in current directory.");
    info("Run this command from the root of your onlyApi project.");
    process.exit(1);
  }

  let currentVersion: string;
  try {
    const pkg = JSON.parse(await Bun.file(pkgPath).text());
    currentVersion = pkg.version ?? "0.0.0";
  } catch {
    error("Could not read package.json.");
    process.exit(1);
  }

  // Check if it looks like an onlyApi project
  const hasOnlyApiStructure =
    existsSync(join(projectDir, "src/main.ts")) &&
    existsSync(join(projectDir, "src/core")) &&
    existsSync(join(projectDir, "src/presentation"));

  if (!hasOnlyApiStructure) {
    error("This doesn't appear to be an onlyApi project.");
    info("Expected to find src/main.ts, src/core/, and src/presentation/");
    process.exit(1);
  }

  // ── Check for updates ──
  section("Checking for updates");

  const checkSpinner = createSpinner("Fetching latest version...");
  checkSpinner.start();

  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    checkSpinner.stop();
    warn("Could not determine the latest version.");
    info("This may be due to network issues or API rate limits.");
    blank();

    const forceUpgrade = args.includes("--force") || args.includes("-f");
    if (!forceUpgrade) {
      const shouldContinue = await confirm("Continue with upgrade from main branch?", false);
      if (!shouldContinue) {
        info("Aborted.");
        process.exit(0);
      }
    }
  } else {
    checkSpinner.stop("Version check complete");
    blank();

    printKeyValue([
      ["Current version", currentVersion],
      ["Latest version", latestVersion],
    ]);

    blank();

    if (
      !isNewer(latestVersion, currentVersion) &&
      !args.includes("--force") &&
      !args.includes("-f")
    ) {
      success("You're already on the latest version!");
      blank();
      process.exit(0);
    }

    if (isNewer(latestVersion, currentVersion)) {
      info(
        `Update available: ${bold(yellow(currentVersion))} ${dim("→")} ${bold(green(latestVersion))}`,
      );
    } else {
      info(`Re-applying latest version ${dim("(--force)")}`);
    }
  }

  // ── Check for uncommitted changes ──
  const hasGit = existsSync(join(projectDir, ".git"));
  if (hasGit) {
    const { stdout: gitStatus } = await exec(["git", "status", "--porcelain"], projectDir);
    if (gitStatus) {
      blank();
      warn("You have uncommitted changes.");
      const shouldContinue = await confirm("Continue anyway?", false);
      if (!shouldContinue) {
        info("Commit your changes first, then retry.");
        process.exit(0);
      }
    }
  }

  // ── Download latest source ──
  section("Downloading update");

  const downloadSpinner = createSpinner("Downloading latest source...");
  downloadSpinner.start();

  const tmpDir = join(projectDir, ".onlyapi-upgrade-tmp");
  try {
    // Clean up any previous tmp
    if (existsSync(tmpDir)) {
      const { rmSync } = await import("node:fs");
      rmSync(tmpDir, { recursive: true, force: true });
    }
    const { mkdirSync } = await import("node:fs");
    mkdirSync(tmpDir, { recursive: true });

    const tarballUrl = latestVersion ? TARBALL_URL(`v${latestVersion}`) : TARBALL_MAIN_URL;

    const response = await fetch(tarballUrl);

    // Fallback to main branch if tag doesn't exist
    let finalResponse = response;
    if (!response.ok && latestVersion) {
      downloadSpinner.update("Tag not found, trying main branch...");
      finalResponse = await fetch(TARBALL_MAIN_URL);
    }

    if (!finalResponse.ok) {
      throw new Error(`HTTP ${finalResponse.status}`);
    }

    const tarPath = join(tmpDir, "update.tar.gz");
    await Bun.write(tarPath, finalResponse);

    downloadSpinner.update("Extracting...");
    await exec(["tar", "xzf", tarPath, "--strip-components=1"], tmpDir);
    const { rmSync: rm } = await import("node:fs");
    rm(tarPath, { force: true });

    downloadSpinner.stop("Download complete");
  } catch (e) {
    downloadSpinner.stop();
    error(`Failed to download update: ${e instanceof Error ? e.message : String(e)}`);
    // Cleanup
    if (existsSync(tmpDir)) {
      const { rmSync: rm } = await import("node:fs");
      rm(tmpDir, { recursive: true, force: true });
    }
    process.exit(1);
  }

  // ── Apply updates ──
  section("Applying updates");

  let updatedCount = 0;
  let skippedCount = 0;

  const dryRun = args.includes("--dry-run");

  for (const filePath of UPGRADEABLE_PATHS) {
    const srcFile = join(tmpDir, filePath);
    const destFile = join(projectDir, filePath);

    if (!existsSync(srcFile)) {
      continue;
    }

    try {
      const newContent = await Bun.file(srcFile).text();

      if (existsSync(destFile)) {
        const currentContent = await Bun.file(destFile).text();
        if (currentContent === newContent) {
          skippedCount++;
          continue; // No changes needed
        }
      }

      if (!dryRun) {
        // Ensure parent directory exists
        const dir = destFile.substring(0, destFile.lastIndexOf("/"));
        const { mkdirSync } = await import("node:fs");
        mkdirSync(dir, { recursive: true });
        await Bun.write(destFile, newContent);
      }

      step(`${dryRun ? `${dim("[dry-run]")} ` : ""}Updated ${bold(cyan(filePath))}`);
      updatedCount++;
    } catch {
      warn(`Could not update ${filePath}`);
    }
  }

  // ── Update dependencies ──
  const newPkgPath = join(tmpDir, "package.json");
  if (existsSync(newPkgPath)) {
    try {
      const newPkg = JSON.parse(await Bun.file(newPkgPath).text());
      const currentPkg = JSON.parse(await Bun.file(pkgPath).text());

      let depsChanged = false;

      // Merge dependencies (add new ones, update existing)
      if (newPkg.dependencies) {
        currentPkg.dependencies = currentPkg.dependencies ?? {};
        for (const [dep, ver] of Object.entries(newPkg.dependencies)) {
          if (currentPkg.dependencies[dep] !== ver) {
            currentPkg.dependencies[dep] = ver;
            depsChanged = true;
          }
        }
      }

      // Merge devDependencies
      if (newPkg.devDependencies) {
        currentPkg.devDependencies = currentPkg.devDependencies ?? {};
        for (const [dep, ver] of Object.entries(newPkg.devDependencies)) {
          if (currentPkg.devDependencies[dep] !== ver) {
            currentPkg.devDependencies[dep] = ver;
            depsChanged = true;
          }
        }
      }

      // Update version
      if (latestVersion) {
        currentPkg.version = latestVersion;
      }

      if (!dryRun) {
        await Bun.write(pkgPath, `${JSON.stringify(currentPkg, null, 2)}\n`);
      }

      if (depsChanged) {
        step(
          `${dryRun ? `${dim("[dry-run]")} ` : ""}Updated dependencies in ${bold(cyan("package.json"))}`,
        );
      }
    } catch {
      warn("Could not merge package.json dependencies");
    }
  }

  // ── Cleanup tmp ──
  if (existsSync(tmpDir)) {
    const { rmSync: rm } = await import("node:fs");
    rm(tmpDir, { recursive: true, force: true });
  }

  // ── Re-install dependencies ──
  if (!dryRun && updatedCount > 0) {
    section("Installing dependencies");

    const installSpinner = createSpinner("Running bun install...");
    installSpinner.start();

    const { exitCode: installExit } = await exec(["bun", "install"], projectDir);

    if (installExit !== 0) {
      installSpinner.stop();
      warn("bun install failed — run it manually.");
    } else {
      installSpinner.stop("Dependencies installed");
    }
  }

  // ── Git commit ──
  if (hasGit && !dryRun && updatedCount > 0) {
    const shouldCommit = await confirm("Create a git commit for this upgrade?");
    if (shouldCommit) {
      const commitMsg = latestVersion
        ? `chore: upgrade onlyApi to v${latestVersion}`
        : "chore: upgrade onlyApi to latest";
      await exec(["git", "add", "-A"], projectDir);
      await exec(["git", "commit", "-m", commitMsg, "--no-verify"], projectDir);
      step("Created upgrade commit");
    }
  }

  // ── Summary ──
  const elapsed = performance.now() - startTime;

  blank();
  if (updatedCount > 0) {
    log(
      `  ${icons.rocket} ${bold(green("Upgrade complete!"))} ${dim(`(${formatDuration(elapsed)})`)}`,
    );
    blank();
    printKeyValue([
      ["Files updated", String(updatedCount)],
      ["Files unchanged", String(skippedCount)],
    ]);
  } else if (dryRun) {
    log(`  ${icons.info} ${bold(cyan("Dry run complete"))} — no files were modified.`);
  } else {
    success("All files are already up to date!");
  }

  blank();

  // ── Show what's NOT upgraded ──
  if (updatedCount > 0) {
    log(`  ${dim("Note: The following files are NOT auto-upgraded (your custom code):")}`);
    log(`  ${dim("  - src/application/     (your services & DTOs)")}`);
    log(`  ${dim("  - src/core/entities/   (your domain entities)")}`);
    log(`  ${dim("  - src/core/ports/      (your port interfaces)")}`);
    log(`  ${dim("  - src/presentation/handlers/  (your route handlers)")}`);
    log(`  ${dim("  - src/presentation/routes/    (your routes)")}`);
    log(`  ${dim("  - src/main.ts          (your bootstrap)")}`);
    blank();
    log(`  ${dim("Review the")} ${cyan("CHANGELOG.md")} ${dim("for breaking changes.")}`);
    blank();
  }
};
