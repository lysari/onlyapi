import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAuthService } from "./application/services/auth.service.js";
import { createHealthService } from "./application/services/health.service.js";
import { createUserService } from "./application/services/user.service.js";
import { loadConfig } from "./infrastructure/config/config.js";
import { migrateUp } from "./infrastructure/database/migrations/runner.js";
import { createSqliteAccountLockout } from "./infrastructure/database/sqlite-account-lockout.js";
import { createSqliteTokenBlacklist } from "./infrastructure/database/sqlite-token-blacklist.js";
import { createSqliteUserRepository } from "./infrastructure/database/sqlite-user.repository.js";
import { createLogger } from "./infrastructure/logging/logger.js";
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
  const logger = createLogger(config.log.level);
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

  // 6. Register in DI container
  Container.register(Tokens.Logger, logger);
  Container.register(Tokens.Config, config);
  Container.register(Tokens.Database, db);
  Container.register(Tokens.PasswordHasher, passwordHasher);
  Container.register(Tokens.TokenService, tokenService);
  Container.register(Tokens.TokenBlacklist, tokenBlacklist);
  Container.register(Tokens.AccountLockout, accountLockout);
  Container.register(Tokens.UserRepository, userRepo);

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
    version: "1.1.0",
  });

  Container.register(Tokens.AuthService, authService);
  Container.register(Tokens.UserService, userService);
  Container.register(Tokens.HealthService, healthService);

  // 8. Presentation
  const router = createRouter({ authService, userService, healthService, tokenService, logger });
  const srv = createServer({ config, logger, router });

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
  });

  return instance;
};

bootstrap();
