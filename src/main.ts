import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminService } from "./application/services/admin.service.js";
import { createApiKeyService } from "./application/services/api-key.service.js";
import { createAuthService } from "./application/services/auth.service.js";
import { createHealthService } from "./application/services/health.service.js";
import { createUserService } from "./application/services/user.service.js";
import { AlertLevel } from "./core/ports/alert-sink.js";
import { CircuitState } from "./core/ports/circuit-breaker.js";
import type { OAuthProvider } from "./core/ports/oauth.js";
import { createNoopAlertSink, createWebhookAlertSink } from "./infrastructure/alerting/webhook.js";
import { loadConfig } from "./infrastructure/config/config.js";
import { migrateUp } from "./infrastructure/database/migrations/runner.js";
import { createSqliteAccountLockout } from "./infrastructure/database/sqlite-account-lockout.js";
import { createSqliteApiKeyRepository } from "./infrastructure/database/sqlite-api-keys.js";
import { createSqliteAuditLog } from "./infrastructure/database/sqlite-audit-log.js";
import { createSqliteOAuthAccountRepo } from "./infrastructure/database/sqlite-oauth-accounts.js";
import { createSqlitePasswordHistory } from "./infrastructure/database/sqlite-password-history.js";
import { createSqliteRefreshTokenStore } from "./infrastructure/database/sqlite-refresh-token-store.js";
import { createSqliteTokenBlacklist } from "./infrastructure/database/sqlite-token-blacklist.js";
import { createSqliteUserRepository } from "./infrastructure/database/sqlite-user.repository.js";
import { createSqliteVerificationTokenRepo } from "./infrastructure/database/sqlite-verification-tokens.js";
import { createEventBus } from "./infrastructure/events/event-bus.js";
import { createDomainEventFactory } from "./infrastructure/events/event-factory.js";
import { createInMemoryWebhookRegistry } from "./infrastructure/events/in-memory-webhook-registry.js";
import { createWebhookDispatcher } from "./infrastructure/events/webhook-dispatcher.js";
import { createInMemoryJobQueue } from "./infrastructure/jobs/job-queue.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createMetricsCollector } from "./infrastructure/metrics/prometheus.js";
import { createGitHubOAuthProvider } from "./infrastructure/oauth/github.js";
import { createGoogleOAuthProvider } from "./infrastructure/oauth/google.js";
import { createCircuitBreaker } from "./infrastructure/resilience/circuit-breaker.js";
import { createPasswordHasher } from "./infrastructure/security/password-hasher.js";
import { createPasswordPolicy } from "./infrastructure/security/password-policy.js";
import { createTokenService } from "./infrastructure/security/token-service.js";
import { createTotpService } from "./infrastructure/security/totp-service.js";
import { createWebSocketManager } from "./presentation/handlers/websocket.handler.js";
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

  // 5b. v1.4 — Auth platform repositories
  const verificationTokens = createSqliteVerificationTokenRepo(db);
  const refreshTokenStore = createSqliteRefreshTokenStore(db);
  const apiKeyRepo = createSqliteApiKeyRepository(db);
  const passwordHistory = createSqlitePasswordHistory(db);
  const oauthAccounts = createSqliteOAuthAccountRepo(db);

  // 5c. v1.4 — Security services
  const totpService = createTotpService();
  const passwordPolicy = createPasswordPolicy(config.passwordPolicy);

  // 5d. v1.4 — OAuth providers (only registered when configured)
  const oauthProviders = new Map<string, OAuthProvider>();
  if (config.oauth.googleClientId && config.oauth.googleClientSecret) {
    oauthProviders.set(
      "google",
      createGoogleOAuthProvider({
        clientId: config.oauth.googleClientId,
        clientSecret: config.oauth.googleClientSecret,
      }),
    );
    logger.info("OAuth provider registered: google");
  }
  if (config.oauth.githubClientId && config.oauth.githubClientSecret) {
    oauthProviders.set(
      "github",
      createGitHubOAuthProvider({
        clientId: config.oauth.githubClientId,
        clientSecret: config.oauth.githubClientSecret,
      }),
    );
    logger.info("OAuth provider registered: github");
  }

  // 5e. v1.5 — Event system, webhooks, job queue
  const eventBus = createEventBus({ logger: logger.child({ service: "event-bus" }) });
  const eventFactory = createDomainEventFactory();
  const webhookRegistry = createInMemoryWebhookRegistry();
  const webhookDispatcher = createWebhookDispatcher({
    registry: webhookRegistry,
    logger: logger.child({ service: "webhook" }),
  });
  const jobQueue = createInMemoryJobQueue({
    logger: logger.child({ service: "job-queue" }),
  });

  // Wire webhook dispatcher as a wildcard event subscriber
  eventBus.subscribeAll((event) => webhookDispatcher.dispatch(event));

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
  Container.register(Tokens.VerificationTokenRepository, verificationTokens);
  Container.register(Tokens.RefreshTokenStore, refreshTokenStore);
  Container.register(Tokens.ApiKeyRepository, apiKeyRepo);
  Container.register(Tokens.PasswordHistory, passwordHistory);
  Container.register(Tokens.PasswordPolicy, passwordPolicy);
  Container.register(Tokens.TotpService, totpService);
  Container.register(Tokens.OAuthProviders, oauthProviders);
  Container.register(Tokens.OAuthAccountRepository, oauthAccounts);

  // 6b. v1.5 — Event, webhook, and job queue registrations
  Container.register(Tokens.EventBus, eventBus);
  Container.register(Tokens.EventFactory, eventFactory);
  Container.register(Tokens.WebhookRegistry, webhookRegistry);
  Container.register(Tokens.WebhookDispatcher, webhookDispatcher);
  Container.register(Tokens.JobQueue, jobQueue);

  // 6c. Observability — metrics collector
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
    verificationTokens,
    refreshTokenStore,
    passwordHistory,
    passwordPolicy,
    totpService,
    oauthProviders,
    oauthAccounts,
    logger: logger.child({ service: "auth" }),
  });

  const userService = createUserService({
    userRepo,
    passwordHasher,
    logger: logger.child({ service: "user" }),
  });

  const healthService = createHealthService({
    logger: logger.child({ service: "health" }),
    version: "1.5.0",
    circuitBreakers: [dbCircuitBreaker],
  });

  const adminService = createAdminService({
    userRepo,
    auditLog,
    logger: logger.child({ service: "admin" }),
  });

  const apiKeyService = createApiKeyService({
    apiKeyRepo,
    logger: logger.child({ service: "api-key" }),
  });

  Container.register(Tokens.AuthService, authService);
  Container.register(Tokens.UserService, userService);
  Container.register(Tokens.HealthService, healthService);
  Container.register(Tokens.AdminService, adminService);
  Container.register(Tokens.ApiKeyService, apiKeyService);

  // 8. Presentation
  const router = createRouter({
    authService,
    userService,
    healthService,
    adminService,
    apiKeyService,
    tokenService,
    metricsCollector,
    oauthProviders,
    eventBus,
    webhookRegistry,
    logger,
  });

  // 8b. WebSocket manager
  const wsManager = createWebSocketManager({
    tokenService,
    eventBus,
    logger: logger.child({ service: "websocket" }),
  });
  Container.register(Tokens.WebSocketManager, wsManager);

  // Wire WebSocket manager as event subscriber (broadcast to WS clients)
  eventBus.subscribeAll((event) => wsManager.broadcast(event));

  const srv = createServer({ config, logger, router, metrics: metricsCollector, wsManager });

  // 9. Start
  const instance = srv.start();
  jobQueue.start();

  // 10. Print startup banner
  const isCluster = Bun.env["WORKER_ID"] !== undefined;
  if (!isCluster) {
    printStartupBanner({
      config,
      bootTimeMs: performance.now() - bootStart,
    });
  }

  // 11. Periodic token pruning (every 10 minutes)
  const pruneInterval = setInterval(
    async () => {
      const blacklistResult = await tokenBlacklist.prune();
      if (blacklistResult.ok && blacklistResult.value > 0) {
        logger.debug("Pruned expired blacklisted tokens", { count: blacklistResult.value });
      }

      const verifyResult = await verificationTokens.prune();
      if (verifyResult.ok && verifyResult.value > 0) {
        logger.debug("Pruned expired verification tokens", { count: verifyResult.value });
      }

      const refreshResult = await refreshTokenStore.prune(30 * 24 * 60 * 60 * 1000);
      if (refreshResult.ok && refreshResult.value > 0) {
        logger.debug("Pruned revoked refresh token families", { count: refreshResult.value });
      }
    },
    10 * 60 * 1000,
  );

  // 12. Graceful shutdown
  const shutdown = (signal: string) => {
    clearInterval(pruneInterval);
    jobQueue.stop();
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
