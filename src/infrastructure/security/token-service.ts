import type { UserRole } from "../../core/entities/user.entity.js";
import { type AppError, internal, unauthorized } from "../../core/errors/app-error.js";
import type { TokenPair, TokenPayload, TokenService } from "../../core/ports/token-service.js";
import type { UserId } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * JWT token service using Web Crypto API (Bun-native, zero deps).
 * Signs with HMAC-SHA256.
 */

interface JwtConfig {
  readonly secret: string;
  readonly expiresIn: string;
  readonly refreshExpiresIn: string;
}

const parseDuration = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit ?? "m"] ?? 60);
};

const base64url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const base64urlEncode = (str: string): string =>
  base64url(new TextEncoder().encode(str).buffer as ArrayBuffer);

const base64urlDecode = (str: string): string => {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
};

const importKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const createJwt = async (
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> => {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64urlEncode(
    JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }),
  );
  const data = `${header}.${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
};

const verifyJwt = async (
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const key = await importKey(secret);
  const data = `${header}.${body}`;

  // Reconstruct signature buffer
  const sigStr = sig.replace(/-/g, "+").replace(/_/g, "/");
  const sigBuf = Uint8Array.from(atob(sigStr), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(data));
  if (!valid) return null;

  const payload = JSON.parse(base64urlDecode(body)) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload["exp"] === "number" && payload["exp"] < now) return null;

  return payload;
};

export const createTokenService = (config: JwtConfig): TokenService => {
  const accessTtl = parseDuration(config.expiresIn);
  const refreshTtl = parseDuration(config.refreshExpiresIn);

  return {
    async sign(payload: TokenPayload): Promise<Result<TokenPair, AppError>> {
      try {
        const claims = { sub: payload.sub, role: payload.role, type: "access" };
        const refreshClaims = { sub: payload.sub, role: payload.role, type: "refresh" };
        const [accessToken, refreshToken] = await Promise.all([
          createJwt(claims, config.secret, accessTtl),
          createJwt(refreshClaims, config.secret, refreshTtl),
        ]);
        return ok({ accessToken, refreshToken });
      } catch (e: unknown) {
        return err(internal("Failed to sign token", e));
      }
    },

    async verify(token: string): Promise<Result<TokenPayload, AppError>> {
      try {
        const payload = await verifyJwt(token, config.secret);
        if (!payload) return err(unauthorized("Invalid or expired token"));
        return ok({
          sub: payload["sub"] as UserId,
          role: payload["role"] as UserRole,
        });
      } catch (e: unknown) {
        return err(unauthorized("Token verification failed"));
      }
    },

    async refresh(refreshToken: string): Promise<Result<TokenPair, AppError>> {
      try {
        const payload = await verifyJwt(refreshToken, config.secret);
        if (!payload || payload["type"] !== "refresh") {
          return err(unauthorized("Invalid refresh token"));
        }
        const newClaims = {
          sub: payload["sub"] as UserId,
          role: payload["role"] as UserRole,
        };
        const refreshClaims = { ...newClaims, type: "refresh" };
        const accessClaims = { ...newClaims, type: "access" };
        const [accessTk, refreshTk] = await Promise.all([
          createJwt(accessClaims, config.secret, accessTtl),
          createJwt(refreshClaims, config.secret, refreshTtl),
        ]);
        return ok({ accessToken: accessTk, refreshToken: refreshTk });
      } catch (e: unknown) {
        return err(internal("Failed to refresh token", e));
      }
    },
  };
};
