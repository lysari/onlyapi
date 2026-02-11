import { loadConfig } from "./infrastructure/config/config.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { createPasswordHasher } from "./infrastructure/security/password-hasher.js";
import { createTokenService } from "./infrastructure/security/token-service.js";
import { createInMemoryUserRepository } from "./infrastructure/database/in-memory-user.repository.js";
import { createAuthService } from "./application/services/auth.service.js";
import { createUserService } from "./application/services/user.service.js";
import { createHealthService } from "./application/services/health.service.js";
import { createRouter } from "./presentation/routes/router.js";
import { createServer } from "./presentation/server.js";
import { Container, Tokens } from "./shared/container.js";
import { printStartupBanner, printShutdown } from "./shared/cli.js";

/**
 * Bootstrap — compose the entire dependency graph, then start the server.
 * Single entry point, fail-fast on misconfiguration.
 */
const bootstrap = () => {
  const bootStart = performance.now();

  // 1. Config (validated, fails fast)
  const config = loadConfig();

  // 2. Infrastructure
  const logger = createLogger(config.log.level);
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService(config.jwt);
  const userRepo = createInMemoryUserRepository();

  // 3. Register in DI container
  Container.register(Tokens.Logger, logger);
  Container.register(Tokens.Config, config);
  Container.register(Tokens.PasswordHasher, passwordHasher);
  Container.register(Tokens.TokenService, tokenService);
  Container.register(Tokens.UserRepository, userRepo);

  // 4. Application services
  const authService = createAuthService({
    userRepo,
    passwordHasher,
    tokenService,
    logger: logger.child({ service: "auth" }),
  });

  const userService = createUserService({
    userRepo,
    passwordHasher,
    logger: logger.child({ service: "user" }),
  });

  const healthService = createHealthService({
    logger: logger.child({ service: "health" }),
    version: "1.0.0",
  });

  Container.register(Tokens.AuthService, authService);
  Container.register(Tokens.UserService, userService);
  Container.register(Tokens.HealthService, healthService);

  // 5. Presentation
  const router = createRouter({ authService, userService, healthService, tokenService, logger });
  const srv = createServer({ config, logger, router });

  // 6. Start
  const instance = srv.start();

  // 7. Print startup banner
  const isCluster = Bun.env["WORKER_ID"] !== undefined;
  if (!isCluster) {
    printStartupBanner({
      config,
      bootTimeMs: performance.now() - bootStart,
    });
  }

  // 8. Graceful shutdown
  const shutdown = (signal: string) => {
    srv.flush(); // flush buffered access logs before exit
    printShutdown(signal);
    instance.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 9. Unhandled rejection safety net
  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled promise rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  return instance;
};

bootstrap();
