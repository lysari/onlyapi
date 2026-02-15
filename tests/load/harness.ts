/**
 * Load Test Harness — automated performance regression detection.
 *
 * Uses Bun's native HTTP to blast the API at high concurrency,
 * then collects latency percentiles, RPS, and error rates.
 *
 * Usage:
 *   bun run tests/load/harness.ts                     # default: 10s, 50 concurrency
 *   bun run tests/load/harness.ts --duration 30 --concurrency 100
 *   bun run tests/load/harness.ts --url http://staging:3000
 *
 * The harness exits with code 1 if:
 *   - p99 latency exceeds threshold
 *   - error rate exceeds 1%
 *   - RPS is below minimum
 */

interface LoadTestConfig {
  url: string;
  durationSec: number;
  concurrency: number;
  /** Maximum p99 latency in ms before failing */
  maxP99Ms: number;
  /** Maximum error rate (0-1) */
  maxErrorRate: number;
  /** Minimum requests per second */
  minRps: number;
}

interface LoadTestResult {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  rps: number;
  errorRate: number;
  latencies: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  };
}

/** Resolve a CLI flag value from args, advancing index */
const resolveFlag = (args: string[], i: number): { value: string | undefined; skip: boolean } => {
  const next = args[i + 1];
  return next ? { value: next, skip: true } : { value: undefined, skip: false };
};

/** Apply a single CLI flag to the config */
const applyFlag = (config: LoadTestConfig, flag: string, value: string): void => {
  const handlers: Record<string, () => void> = {
    "--url": () => {
      config.url = value;
    },
    "--duration": () => {
      config.durationSec = Number.parseInt(value, 10);
    },
    "--concurrency": () => {
      config.concurrency = Number.parseInt(value, 10);
    },
    "--max-p99": () => {
      config.maxP99Ms = Number.parseFloat(value);
    },
    "--min-rps": () => {
      config.minRps = Number.parseFloat(value);
    },
  };
  handlers[flag]?.();
};

/** Parse CLI arguments */
const parseArgs = (): LoadTestConfig => {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    url: "http://127.0.0.1:3000",
    durationSec: 10,
    concurrency: 50,
    maxP99Ms: 100,
    maxErrorRate: 0.01,
    minRps: 1000,
  };

  for (let i = 0; i < args.length; i++) {
    const { value, skip } = resolveFlag(args, i);
    if (value) {
      applyFlag(config, args[i] ?? "", value);
    }
    if (skip) i++;
  }

  return config;
};

/** Compute percentile from sorted array */
const percentile = (sorted: Float64Array, p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
};

/** Single load test scenario */
const runScenario = async (
  name: string,
  config: LoadTestConfig,
  makeRequest: () => Promise<boolean>,
): Promise<LoadTestResult> => {
  console.log(`\n── ${name} ──`);
  console.log(`  URL: ${config.url}`);
  console.log(`  Duration: ${config.durationSec}s | Concurrency: ${config.concurrency}`);

  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  let running = true;

  const deadline = Date.now() + config.durationSec * 1000;
  const start = performance.now();

  // Worker function — each runs in a tight loop
  const worker = async () => {
    while (running && Date.now() < deadline) {
      const t0 = performance.now();
      try {
        const ok = await makeRequest();
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        if (ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
        latencies.push(performance.now() - t0);
      }
    }
  };

  // Launch concurrent workers
  const workers = Array.from({ length: config.concurrency }, () => worker());
  await Promise.all(workers);
  running = false;

  const durationMs = performance.now() - start;

  // Compute latency stats
  const sorted = new Float64Array(latencies).sort();
  const sum = sorted.reduce((a, b) => a + b, 0);

  const result: LoadTestResult = {
    totalRequests: successCount + errorCount,
    successCount,
    errorCount,
    durationMs,
    rps: ((successCount + errorCount) / durationMs) * 1000,
    errorRate: errorCount / Math.max(1, successCount + errorCount),
    latencies: {
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sum / Math.max(1, sorted.length),
    },
  };

  // Print results
  console.log(`  Total:    ${result.totalRequests} requests`);
  console.log(`  Success:  ${result.successCount}`);
  console.log(`  Errors:   ${result.errorCount} (${(result.errorRate * 100).toFixed(2)}%)`);
  console.log(`  RPS:      ${result.rps.toFixed(0)}`);
  console.log("  Latency:");
  console.log(`    p50:  ${result.latencies.p50.toFixed(2)}ms`);
  console.log(`    p90:  ${result.latencies.p90.toFixed(2)}ms`);
  console.log(`    p95:  ${result.latencies.p95.toFixed(2)}ms`);
  console.log(`    p99:  ${result.latencies.p99.toFixed(2)}ms`);
  console.log(`    min:  ${result.latencies.min.toFixed(2)}ms`);
  console.log(`    max:  ${result.latencies.max.toFixed(2)}ms`);
  console.log(`    avg:  ${result.latencies.avg.toFixed(2)}ms`);

  return result;
};

/** Check results against thresholds */
const checkThresholds = (
  _name: string,
  result: LoadTestResult,
  config: LoadTestConfig,
): boolean => {
  let pass = true;

  if (result.latencies.p99 > config.maxP99Ms) {
    console.error(
      `  ✗ FAIL: p99 ${result.latencies.p99.toFixed(2)}ms > ${config.maxP99Ms}ms threshold`,
    );
    pass = false;
  } else {
    console.log(`  ✓ PASS: p99 ${result.latencies.p99.toFixed(2)}ms <= ${config.maxP99Ms}ms`);
  }

  if (result.errorRate > config.maxErrorRate) {
    console.error(
      `  ✗ FAIL: error rate ${(result.errorRate * 100).toFixed(2)}% > ${(config.maxErrorRate * 100).toFixed(2)}%`,
    );
    pass = false;
  } else {
    console.log(
      `  ✓ PASS: error rate ${(result.errorRate * 100).toFixed(2)}% <= ${(config.maxErrorRate * 100).toFixed(2)}%`,
    );
  }

  if (result.rps < config.minRps) {
    console.error(`  ✗ FAIL: RPS ${result.rps.toFixed(0)} < ${config.minRps} minimum`);
    pass = false;
  } else {
    console.log(`  ✓ PASS: RPS ${result.rps.toFixed(0)} >= ${config.minRps}`);
  }

  return pass;
};

// ── Main ──

const main = async () => {
  const config = parseArgs();

  console.log("═══════════════════════════════════════");
  console.log("  onlyApi Load Test Harness v2.0");
  console.log("═══════════════════════════════════════");

  // Wait for server to be ready
  console.log("\nWaiting for server...");
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${config.url}/health`);
      if (res.ok) {
        console.log("Server is ready ✓");
        break;
      }
    } catch {
      // Not ready
    }
    if (i === 29) {
      console.error("Server not reachable at", config.url);
      process.exit(1);
    }
    await Bun.sleep(500);
  }

  let allPassed = true;

  // Scenario 1: Health check (no auth, minimal processing)
  const healthResult = await runScenario("GET /health (baseline)", config, async () => {
    const res = await fetch(`${config.url}/health`);
    return res.ok;
  });
  if (!checkThresholds("Health", healthResult, config)) allPassed = false;

  // Scenario 2: Auth flow — register + login
  const authEmail = `load-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const authPassword = "LoadTest!Pass123";

  // Pre-register a user for login tests
  await fetch(`${config.url}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: authEmail, password: authPassword }),
  });

  let counter = 0;
  const registerResult = await runScenario(
    "POST /api/v1/auth/register (write path)",
    { ...config, maxP99Ms: 500, minRps: 100 },
    async () => {
      const idx = counter++;
      const res = await fetch(`${config.url}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `load-${Date.now()}-${idx}@test.com`,
          password: authPassword,
        }),
      });
      return res.status === 201;
    },
  );
  if (!checkThresholds("Register", registerResult, { ...config, maxP99Ms: 500, minRps: 100 })) {
    allPassed = false;
  }

  const loginResult = await runScenario(
    "POST /api/v1/auth/login",
    { ...config, maxP99Ms: 300, minRps: 200 },
    async () => {
      const res = await fetch(`${config.url}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      return res.status === 200;
    },
  );
  if (!checkThresholds("Login", loginResult, { ...config, maxP99Ms: 300, minRps: 200 })) {
    allPassed = false;
  }

  // Scenario 3: Metrics endpoint
  const metricsResult = await runScenario("GET /metrics", config, async () => {
    const res = await fetch(`${config.url}/metrics`);
    return res.ok;
  });
  if (!checkThresholds("Metrics", metricsResult, config)) allPassed = false;

  // Summary
  console.log("\n═══════════════════════════════════════");
  if (allPassed) {
    console.log("  All load test scenarios PASSED ✓");
    console.log("═══════════════════════════════════════\n");
  } else {
    console.log("  Some load test scenarios FAILED ✗");
    console.log("═══════════════════════════════════════\n");
    process.exit(1);
  }
};

main();
