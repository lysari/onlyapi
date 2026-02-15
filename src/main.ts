import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminService } from "./application/services/admin.service.js";
import { createAuthService } from "./application/services/auth.service.js";
import { createHealthService } from "./application/services/health.service.js";
import { createUserService } from "./application/services/user.service.js";
import { AlertLevel } from "./core/ports/alert-sink.js";
import { CircuitState } from "./core/ports/circuit-breaker.js";
import { createNoopAlertSink, createWebhookAlertSink } from "./infrastructure/alerting/webhook.js";
import { loadConfig } from "./infrastructure/config/config.js";
import { migrateUp } from "./infrastructure/database/migrations/runner.js";
import { createSqliteAccountLockout } from "./infrastructure/database/sqlite-account-lockout.js";
import { createSqliteAuditLog } from "./infrastructure/database/sqlite-audit-log.js";
import { createSqliteTokenBlacklist } from "./infrastructure/database/sqlite-token-blacklist.js";
import { createSqliteUserRepository } from "./infrastructure/database/sqlite-user.repository.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createMetricsCollector } from "./infrastructure/metrics/prometheus.js";
import { createCircuitBreaker } from "./infrastructure/resilience/circuit-breaker.js";
import { createPasswordHasher } from "./infrastructure/security/password-hasher.js";
import { createTokenService } from "./infrastructure/security/token-service.js";
import { createRouter } from "./presentation/routes/router.js";
import { createServer } from "./presentation/server.js";
import { printShutdown, printStartupBanner } from "./shared/cli.js";
import { Container, Tokens } from "./shared/container.js";

/**
 * Bootstrap — compose the entire dependency graph, then start the server.
 * Single entry point, fail-fast on misconfiguration.
 */
const bootstrap = async () => {
  const bootStart = performance.now();

  // 1. Config (validated, fails fast)
  const config = loadConfig();

  // 2. Infrastructure
  const logger = createLogger(config.log.level, {}, config.log.format);
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService(config.jwt);

  // 3. Database — SQLite (zero deps, bun:sqlite built-in)
  const dbPath = config.database.path;
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  logger.info("SQLite database opened", { path: dbPath });

  // 4. Run migrations
  await migrateUp(db, logger);

  // 5. Repositories & services backed by SQLite
  const userRepo = createSqliteUserRepository(db);
  const tokenBlacklist = createSqliteTokenBlacklist(db);
  const accountLockout = createSqliteAccountLockout(db, {
    maxAttempts: config.lockout.maxAttempts,
    lockoutDurationMs: config.lockout.durationMs,
  });
  const auditLog = createSqliteAuditLog(db);

  // 6. Register in DI container
  Container.register(Tokens.Logger, logger);
  Container.register(Tokens.Config, config);
  Container.register(Tokens.Database, db);
  Container.register(Tokens.PasswordHasher, passwordHasher);
  Container.register(Tokens.TokenService, tokenService);
  Container.register(Tokens.TokenBlacklist, tokenBlacklist);
  Container.register(Tokens.AccountLockout, accountLockout);
  Container.register(Tokens.UserRepository, userRepo);
  Container.register(Tokens.AuditLog, auditLog);

  // 6b. Observability — metrics collector
  const metricsCollector = createMetricsCollector();
  Container.register(Tokens.MetricsCollector, metricsCollector);

  // 6c. Alerting — webhook alert sink (or noop if no URL configured)
  const alertSink = config.alerting.webhookUrl
    ? createWebhookAlertSink({
        url: config.alerting.webhookUrl,
        timeoutMs: config.alerting.timeoutMs,
        logger: logger.child({ service: "alerting" }),
      })
    : createNoopAlertSink();
  Container.register(Tokens.AlertSink, alertSink);

  // 6d. Resilience — circuit breaker for database operations
  const dbCircuitBreaker = createCircuitBreaker({
    name: "database",
    failureThreshold: config.circuitBreaker.failureThreshold,
    resetTimeoutMs: config.circuitBreaker.resetTimeoutMs,
    halfOpenSuccessThreshold: config.circuitBreaker.halfOpenSuccessThreshold,
    onStateChange: (cbName, from, to) => {
      logger.warn("Circuit breaker state changed", {
        circuitBreaker: cbName,
        from,
        to,
      });

      // Update metrics gauge: 0=closed, 1=half_open, 2=open
      const stateValue = to === CircuitState.CLOSED ? 0 : to === CircuitState.HALF_OPEN ? 1 : 2;
      metricsCollector.circuitBreakerState.set(stateValue, { name: cbName });

      // Fire alerting hooks on state changes
      if (to === CircuitState.OPEN) {
        alertSink.send({
          level: AlertLevel.CRITICAL,
          title: `Circuit breaker OPEN: ${cbName}`,
          message: `Circuit breaker "${cbName}" has opened after reaching failure threshold. Requests will be short-circuited.`,
          timestamp: new Date().toISOString(),
          source: "onlyApi",
          metadata: { circuitBreaker: cbName, from, to },
        });
        metricsCollector.alertsSentTotal.inc({ level: "critical" });
      } else if (to === CircuitState.CLOSED && from === CircuitState.HALF_OPEN) {
        alertSink.send({
          level: AlertLevel.RESOLVED,
          title: `Circuit breaker CLOSED: ${cbName}`,
          message: `Circuit breaker "${cbName}" has recovered and returned to normal operation.`,
          timestamp: new Date().toISOString(),
          source: "onlyApi",
          metadata: { circuitBreaker: cbName, from, to },
        });
        metricsCollector.alertsSentTotal.inc({ level: "resolved" });
      }
    },
  });

  // 7. Application services
  const authService = createAuthService({
    userRepo,
    passwordHasher,
    tokenService,
    tokenBlacklist,
    accountLockout,
    logger: logger.child({ service: "auth" }),
  });

  const userService = createUserService({
    userRepo,
    passwordHasher,
    logger: logger.child({ service: "user" }),
  });

  const healthService = createHealthService({
    logger: logger.child({ service: "health" }),
    version: "1.3.0",
    circuitBreakers: [dbCircuitBreaker],
  });

  const adminService = createAdminService({
    userRepo,
    auditLog,
    logger: logger.child({ service: "admin" }),
  });

  Container.register(Tokens.AuthService, authService);
  Container.register(Tokens.UserService, userService);
  Container.register(Tokens.HealthService, healthService);
  Container.register(Tokens.AdminService, adminService);

  // 8. Presentation
  const router = createRouter({
    authService,
    userService,
    healthService,
    adminService,
    tokenService,
    metricsCollector,
    logger,
  });
  const srv = createServer({ config, logger, router, metrics: metricsCollector });

  // 9. Start
  const instance = srv.start();

  // 10. Print startup banner
  const isCluster = Bun.env["WORKER_ID"] !== undefined;
  if (!isCluster) {
    printStartupBanner({
      config,
      bootTimeMs: performance.now() - bootStart,
    });
  }

  // 11. Periodic token blacklist pruning (every 10 minutes)
  const pruneInterval = setInterval(
    async () => {
      const result = await tokenBlacklist.prune();
      if (result.ok && result.value > 0) {
        logger.debug("Pruned expired blacklisted tokens", { count: result.value });
      }
    },
    10 * 60 * 1000,
  );

  // 12. Graceful shutdown
  const shutdown = (signal: string) => {
    clearInterval(pruneInterval);
    srv.flush(); // flush buffered access logs before exit
    db.close(); // close SQLite connection
    printShutdown(signal);
    instance.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 13. Unhandled rejection safety net
  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled promise rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // Fire alert on fatal errors
    alertSink.send({
      level: AlertLevel.CRITICAL,
      title: "Unhandled promise rejection",
      message: reason instanceof Error ? reason.message : String(reason),
      timestamp: new Date().toISOString(),
      source: "onlyApi",
      metadata: {
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    });
    metricsCollector.alertsSentTotal.inc({ level: "critical" });
  });

  return instance;
};

bootstrap();
