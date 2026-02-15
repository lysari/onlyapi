import { z } from "zod";
import { printConfigError } from "../../shared/cli.js";

/**
 * Application config — validated at boot via Zod.
 * Fails fast with clear messages if env vars are missing.
 */
const configSchema = z.object({
  env: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().min(1).default("0.0.0.0"),

  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default("15m"),
    refreshExpiresIn: z.string().default("7d"),
  }),

  cors: z.object({
    origins: z
      .string()
      .transform((s) => s.split(",").map((o) => o.trim()))
      .default("*"),
  }),

  rateLimit: z.object({
    windowMs: z.coerce.number().int().positive().default(60_000),
    maxRequests: z.coerce.number().int().positive().default(100),
  }),

  log: z.object({
    level: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
    format: z.enum(["pretty", "json"]).default("pretty"),
  }),

  database: z.object({
    url: z.string().url().optional(),
    path: z.string().default("data/onlyapi.sqlite"),
  }),

  lockout: z.object({
    maxAttempts: z.coerce.number().int().positive().default(5),
    durationMs: z.coerce.number().int().positive().default(900_000), // 15 minutes
  }),

  alerting: z.object({
    webhookUrl: z.string().url().optional(),
    timeoutMs: z.coerce.number().int().positive().default(5_000),
  }),

  circuitBreaker: z.object({
    failureThreshold: z.coerce.number().int().positive().default(5),
    resetTimeoutMs: z.coerce.number().int().positive().default(30_000),
    halfOpenSuccessThreshold: z.coerce.number().int().positive().default(2),
  }),

  passwordPolicy: z.object({
    minLength: z.coerce.number().int().positive().default(8),
    requireUppercase: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .default("true"),
    requireLowercase: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .default("true"),
    requireDigit: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .default("true"),
    requireSpecial: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .default("false"),
    historyCount: z.coerce.number().int().min(0).default(5),
    maxAgeDays: z.coerce.number().int().min(0).default(0),
  }),

  oauth: z.object({
    googleClientId: z.string().optional(),
    googleClientSecret: z.string().optional(),
    githubClientId: z.string().optional(),
    githubClientSecret: z.string().optional(),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

export const loadConfig = (): AppConfig => {
  const result = configSchema.safeParse({
    env: Bun.env["NODE_ENV"],
    port: Bun.env["PORT"],
    host: Bun.env["HOST"],
    jwt: Bun.env["JWT_SECRET"]
      ? {
          secret: Bun.env["JWT_SECRET"],
          expiresIn: Bun.env["JWT_EXPIRES_IN"],
          refreshExpiresIn: Bun.env["JWT_REFRESH_EXPIRES_IN"],
        }
      : undefined,
    cors: {
      origins: Bun.env["CORS_ORIGINS"],
    },
    rateLimit: {
      windowMs: Bun.env["RATE_LIMIT_WINDOW_MS"],
      maxRequests: Bun.env["RATE_LIMIT_MAX_REQUESTS"],
    },
    log: {
      level: Bun.env["LOG_LEVEL"],
      format: Bun.env["LOG_FORMAT"],
    },
    database: {
      url: Bun.env["DATABASE_URL"],
      path: Bun.env["DATABASE_PATH"],
    },
    lockout: {
      maxAttempts: Bun.env["LOCKOUT_MAX_ATTEMPTS"],
      durationMs: Bun.env["LOCKOUT_DURATION_MS"],
    },
    alerting: {
      webhookUrl: Bun.env["ALERT_WEBHOOK_URL"],
      timeoutMs: Bun.env["ALERT_TIMEOUT_MS"],
    },
    circuitBreaker: {
      failureThreshold: Bun.env["CB_FAILURE_THRESHOLD"],
      resetTimeoutMs: Bun.env["CB_RESET_TIMEOUT_MS"],
      halfOpenSuccessThreshold: Bun.env["CB_HALF_OPEN_SUCCESS_THRESHOLD"],
    },
    passwordPolicy: {
      minLength: Bun.env["PASSWORD_MIN_LENGTH"],
      requireUppercase: Bun.env["PASSWORD_REQUIRE_UPPERCASE"],
      requireLowercase: Bun.env["PASSWORD_REQUIRE_LOWERCASE"],
      requireDigit: Bun.env["PASSWORD_REQUIRE_DIGIT"],
      requireSpecial: Bun.env["PASSWORD_REQUIRE_SPECIAL"],
      historyCount: Bun.env["PASSWORD_HISTORY_COUNT"],
      maxAgeDays: Bun.env["PASSWORD_MAX_AGE_DAYS"],
    },
    oauth: {
      googleClientId: Bun.env["OAUTH_GOOGLE_CLIENT_ID"],
      googleClientSecret: Bun.env["OAUTH_GOOGLE_CLIENT_SECRET"],
      githubClientId: Bun.env["OAUTH_GITHUB_CLIENT_ID"],
      githubClientSecret: Bun.env["OAUTH_GITHUB_CLIENT_SECRET"],
    },
  });

  if (!result.success) {
    const formatted = result.error.flatten();
    printConfigError(formatted.fieldErrors as Record<string, string[]>);
    process.exit(1);
  }

  return result.data;
};
