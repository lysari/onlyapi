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
  }),

  database: z.object({
    url: z.string().url().optional(),
    path: z.string().default("data/onlyapi.sqlite"),
  }),

  lockout: z.object({
    maxAttempts: z.coerce.number().int().positive().default(5),
    durationMs: z.coerce.number().int().positive().default(900_000), // 15 minutes
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
    },
    database: {
      url: Bun.env["DATABASE_URL"],
      path: Bun.env["DATABASE_PATH"],
    },
    lockout: {
      maxAttempts: Bun.env["LOCKOUT_MAX_ATTEMPTS"],
      durationMs: Bun.env["LOCKOUT_DURATION_MS"],
    },
  });

  if (!result.success) {
    const formatted = result.error.flatten();
    printConfigError(formatted.fieldErrors as Record<string, string[]>);
    process.exit(1);
  }

  return result.data;
};
