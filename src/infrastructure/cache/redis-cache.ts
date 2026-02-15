/**
 * Redis cache adapter — using raw TCP via Bun.connect().
 *
 * Zero external dependencies. Implements the RESP (Redis Serialization Protocol)
 * directly over a TCP socket. Supports: GET, SET, DEL, EXISTS, INCRBY, KEYS, QUIT.
 *
 * For production, considers connection pooling. This single-connection adapter
 * is suitable for moderate load. Swap to ioredis or similar for advanced features.
 */

import { internal } from "../../core/errors/app-error.js";
import type { AppError } from "../../core/errors/app-error.js";
import type { Cache } from "../../core/ports/cache.js";
import type { Logger } from "../../core/ports/logger.js";
import { type Result, err, ok } from "../../core/types/result.js";

interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string | undefined;
  readonly db?: number | undefined;
}

interface RedisCacheDeps {
  readonly config: RedisConfig;
  readonly logger: Logger;
}

/**
 * Encode a RESP command: *<n>\r\n$<len>\r\n<arg>\r\n...
 */
const encodeCommand = (args: readonly string[]): string => {
  let cmd = `*${args.length}\r\n`;
  for (const arg of args) {
    cmd += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  }
  return cmd;
};

export const createRedisCache = async (deps: RedisCacheDeps): Promise<Cache> => {
  const { config, logger } = deps;

  let responseBuffer = "";
  let resolveResponse: ((value: string) => void) | null = null;

  const socket = await Bun.connect({
    hostname: config.host,
    port: config.port,
    socket: {
      data(_socket, data) {
        responseBuffer += data.toString();
        if (resolveResponse && responseBuffer.includes("\r\n")) {
          const resolve = resolveResponse;
          resolveResponse = null;
          resolve(responseBuffer);
          responseBuffer = "";
        }
      },
      open() {
        logger.debug("Redis connection established", {
          host: config.host,
          port: config.port,
        });
      },
      close() {
        logger.debug("Redis connection closed");
      },
      error(_socket, error) {
        logger.error("Redis connection error", { error: error.message });
      },
    },
  });

  const sendCommand = async (args: readonly string[]): Promise<string> => {
    const cmd = encodeCommand(args);
    return new Promise<string>((resolve) => {
      resolveResponse = resolve;
      socket.write(cmd);
    });
  };

  /**
   * Parse a simple RESP response.
   * +OK, -ERR, :42, $-1 (nil), $5\r\nhello
   */
  const parseResponse = (raw: string): string | null => {
    if (raw.startsWith("+")) return raw.substring(1, raw.indexOf("\r\n"));
    if (raw.startsWith("-")) throw new Error(raw.substring(1, raw.indexOf("\r\n")));
    if (raw.startsWith(":")) return raw.substring(1, raw.indexOf("\r\n"));
    if (raw.startsWith("$-1")) return null;
    if (raw.startsWith("$")) {
      const firstNewline = raw.indexOf("\r\n");
      const dataStart = firstNewline + 2;
      const len = Number.parseInt(raw.substring(1, firstNewline), 10);
      return raw.substring(dataStart, dataStart + len);
    }
    return raw;
  };

  // Authenticate if password provided
  if (config.password) {
    await sendCommand(["AUTH", config.password]);
  }
  // Select database if specified
  if (config.db !== undefined) {
    await sendCommand(["SELECT", String(config.db)]);
  }

  return {
    async get<T = unknown>(key: string): Promise<Result<T | null, AppError>> {
      try {
        const raw = await sendCommand(["GET", key]);
        const value = parseResponse(raw);
        if (value === null) return ok(null);
        try {
          return ok(JSON.parse(value) as T);
        } catch {
          return ok(value as T);
        }
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<Result<void, AppError>> {
      try {
        const serialized = typeof value === "string" ? value : JSON.stringify(value);
        if (ttlMs !== undefined) {
          await sendCommand(["SET", key, serialized, "PX", String(ttlMs)]);
        } else {
          await sendCommand(["SET", key, serialized]);
        }
        return ok(undefined);
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async del(key: string): Promise<Result<boolean, AppError>> {
      try {
        const raw = await sendCommand(["DEL", key]);
        const value = parseResponse(raw);
        return ok(value === "1");
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async has(key: string): Promise<Result<boolean, AppError>> {
      try {
        const raw = await sendCommand(["EXISTS", key]);
        const value = parseResponse(raw);
        return ok(value === "1");
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async incr(key: string, delta = 1): Promise<Result<number, AppError>> {
      try {
        const raw = await sendCommand(["INCRBY", key, String(delta)]);
        const value = parseResponse(raw);
        return ok(Number(value));
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async delPattern(pattern: string): Promise<Result<number, AppError>> {
      try {
        // KEYS is O(n) — acceptable for admin/maintenance operations
        const raw = await sendCommand(["KEYS", pattern]);
        // Parse array response
        if (raw.startsWith("*0")) return ok(0);

        const lines = raw.split("\r\n").filter(Boolean);
        const keys: string[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (line && !line.startsWith("$")) {
            keys.push(line);
          }
        }

        if (keys.length === 0) return ok(0);

        const delRaw = await sendCommand(["DEL", ...keys]);
        const delVal = parseResponse(delRaw);
        return ok(Number(delVal));
      } catch (e: unknown) {
        return err(internal("Redis error", e));
      }
    },

    async close(): Promise<void> {
      try {
        await sendCommand(["QUIT"]);
      } catch {
        // Ignore errors during close
      }
      socket.end();
    },
  };
};
