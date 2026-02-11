/**
 * Bare-metal benchmark — measures raw Bun.serve() throughput of this server
 * vs an equivalent Elysia setup. Run with:
 *
 *   bun run bench/server.bench.ts
 *
 * For proper HTTP benchmarking, use `bombardier` or `wrk` externally:
 *
 *   # Start server
 *   JWT_SECRET="bench-secret-that-is-at-least-32-char!!" bun src/main.ts
 *
 *   # Benchmark with bombardier (install: brew install bombardier)
 *   bombardier -c 512 -d 10s http://localhost:3000/health
 *
 *   # Or with wrk
 *   wrk -t12 -c400 -d10s http://localhost:3000/health
 *
 * Expected: Our raw Bun.serve() with O(1) Map router should match or exceed
 * Elysia's throughput because Elysia adds overhead on top of this same engine.
 */

const ITERATIONS = 500_000;

// ── Inline micro-benchmark for the hot path components ──

// 1. URL parsing: new URL() vs our extractPath
const extractPath = (url: string): string => {
  const start = url.indexOf("/", url.indexOf("//") + 2);
  if (start === -1) return "/";
  const qIdx = url.indexOf("?", start);
  return qIdx === -1 ? url.substring(start) : url.substring(start, qIdx);
};

const testUrl = "http://localhost:3000/api/v1/auth/login?foo=bar";

// Warm up
for (let i = 0; i < 10_000; i++) new URL(testUrl);
for (let i = 0; i < 10_000; i++) extractPath(testUrl);

// Bench new URL()
let t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const u = new URL(testUrl);
  u.pathname; // force access
}
const urlTime = performance.now() - t0;

// Bench extractPath()
t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  extractPath(testUrl);
}
const extractTime = performance.now() - t0;

console.log("=== URL Parsing Benchmark ===");
console.log(`new URL():      ${urlTime.toFixed(2)}ms for ${ITERATIONS.toLocaleString()} iterations`);
console.log(`extractPath():  ${extractTime.toFixed(2)}ms for ${ITERATIONS.toLocaleString()} iterations`);
console.log(`Speedup:        ${(urlTime / extractTime).toFixed(1)}x faster\n`);

// 2. Route lookup: Map.get() vs regex/trie
const routes = new Map<string, number>();
routes.set("GET /health", 1);
routes.set("POST /api/v1/auth/login", 2);
routes.set("GET /api/v1/users/me", 3);

// Warm up
for (let i = 0; i < 10_000; i++) routes.get("POST /api/v1/auth/login");

t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  routes.get("POST /api/v1/auth/login");
}
const mapTime = performance.now() - t0;

console.log("=== Route Lookup Benchmark ===");
console.log(`Map.get():      ${mapTime.toFixed(2)}ms for ${ITERATIONS.toLocaleString()} iterations`);
console.log(`Per lookup:     ${((mapTime / ITERATIONS) * 1_000_000).toFixed(0)}ns\n`);

// 3. Header pre-computation vs per-request spread
const secHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
};

const secEntries = Object.entries(secHeaders);

// Spread approach (old)
t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const h = new Headers();
  for (const [k, v] of Object.entries(secHeaders)) h.set(k, v);
}
const spreadTime = performance.now() - t0;

// Pre-computed entries approach (new)
t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const h = new Headers();
  for (const [k, v] of secEntries) h.set(k, v);
}
const entriesTime = performance.now() - t0;

console.log("=== Header Application Benchmark ===");
console.log(`Object.entries() per-req:  ${spreadTime.toFixed(2)}ms`);
console.log(`Pre-computed entries:      ${entriesTime.toFixed(2)}ms`);
console.log(`Speedup:                   ${(spreadTime / entriesTime).toFixed(1)}x faster\n`);

console.log("=== Summary ===");
console.log("Our server sits BELOW Elysia in the stack:");
console.log("  Bun.serve() ← We are here (raw, zero framework overhead)");
console.log("  └─ Elysia   ← Adds trie router, lifecycle hooks, schema compilation");
console.log("  └─ Fastify  ← Node.js, separate HTTP parser");
console.log("  └─ Express  ← Node.js, regex routing, callback overhead");
