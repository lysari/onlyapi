import { cpus } from "node:os";
import { printClusterBanner, printShutdown } from "./shared/cli.js";

/**
 * Clustered entry point — spawns one worker per CPU core.
 *
 * Usage:  NODE_ENV=production bun src/cluster.ts
 *
 * Each worker runs its own Bun.serve() with reusePort: true,
 * allowing the kernel to load-balance across all cores via SO_REUSEPORT.
 * This is how you scale to millions of req/s on multi-core servers.
 */

const cpuCount = cpus().length;
const numWorkers = Number(Bun.env["WORKERS"] ?? cpuCount);

printClusterBanner(numWorkers, cpuCount);

const workers: Array<ReturnType<typeof Bun.spawn>> = [];

for (let i = 0; i < numWorkers; i++) {
  const worker = Bun.spawn(["bun", "src/main.ts"], {
    env: {
      ...process.env,
      WORKER_ID: String(i),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  workers.push(worker);
}

// Forward SIGINT/SIGTERM to all workers for graceful shutdown
const shutdown = (signal: string) => {
  printShutdown(signal);
  for (const w of workers) {
    w.kill();
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Monitor worker health
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const white = (s: string) => `\x1b[97m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

for (const [i, worker] of workers.entries()) {
  // Log when worker becomes ready
  process.stdout.write(`  ${green("✓")} ${dim("Worker")} ${bold(white(`#${i}`))} ${dim("ready")} ${dim(`(PID ${worker.pid})`)}
`);

  worker.exited.then((code) => {
    const icon = code === 0 ? green("●") : yellow("●");
    process.stdout.write(`  ${icon} ${dim("Worker")} ${bold(white(`#${i}`))} ${dim("exited")} ${dim(`(code ${code})`)}
`);
  });
}
