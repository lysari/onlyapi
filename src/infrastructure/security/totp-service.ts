import { type AppError, internal } from "../../core/errors/app-error.js";
import type { TotpService } from "../../core/ports/totp-service.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * TOTP implementation (RFC 6238) using Web Crypto HMAC-SHA1.
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.
 * Zero external dependencies.
 */

/** Base32 alphabet (RFC 4648) */
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode a Uint8Array to base32 */
const base32Encode = (data: Uint8Array): string => {
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }
  return result;
};

/** Decode a base32 string to Uint8Array */
const base32Decode = (encoded: string): Uint8Array => {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
};

/** Convert a number to an 8-byte big-endian buffer */
const intToBytes = (num: number): Uint8Array => {
  const buf = new Uint8Array(8);
  let n = num;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buf;
};

/** Dynamic truncation (RFC 4226 §5.4) */
const dynamicTruncate = (hmacResult: Uint8Array): number => {
  // biome-ignore lint/style/noNonNullAssertion: HMAC result always has at least 20 bytes (SHA-1)
  const offset = hmacResult[hmacResult.length - 1]! & 0x0f;
  return (
    // biome-ignore lint/style/noNonNullAssertion: HMAC result always has at least 20 bytes (SHA-1)
    ((hmacResult[offset]! & 0x7f) << 24) |
    // biome-ignore lint/style/noNonNullAssertion: HMAC result always has at least 20 bytes (SHA-1)
    ((hmacResult[offset + 1]! & 0xff) << 16) |
    // biome-ignore lint/style/noNonNullAssertion: HMAC result always has at least 20 bytes (SHA-1)
    ((hmacResult[offset + 2]! & 0xff) << 8) |
    // biome-ignore lint/style/noNonNullAssertion: HMAC result always has at least 20 bytes (SHA-1)
    (hmacResult[offset + 3]! & 0xff)
  );
};

/** TOTP period in seconds */
const PERIOD = 30;

/** Number of periods to allow for clock drift (±1 window = ±30s) */
const WINDOW = 1;

export const createTotpService = (): TotpService => ({
  generateSecret(): string {
    const bytes = new Uint8Array(20); // 160 bits — standard for TOTP
    crypto.getRandomValues(bytes);
    return base32Encode(bytes);
  },

  generateUri(secret: string, email: string, issuer: string): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=${PERIOD}`;
  },

  verify(secret: string, code: string): Result<boolean, AppError> {
    if (!/^\d{6}$/.test(code)) {
      return ok(false);
    }

    const secretBytes = base32Decode(secret);
    const now = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(now / PERIOD);

    // We need to do async HMAC but the port returns sync Result.
    // Use a synchronous Bun.CryptoHasher approach instead.
    // Actually, let's do a synchronous HMAC using Bun's native crypto.
    try {
      for (let i = -WINDOW; i <= WINDOW; i++) {
        const counter = currentCounter + i;
        const counterBytes = intToBytes(counter);
        // biome-ignore lint/suspicious/noExplicitAny: Bun.CryptoHasher buffer compat
        const hasher = new Bun.CryptoHasher("sha1", secretBytes as any);
        // biome-ignore lint/suspicious/noExplicitAny: Bun.CryptoHasher buffer compat
        hasher.update(counterBytes as any);
        const digest = hasher.digest();
        const hmac = new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
        const truncated = dynamicTruncate(hmac) % 1_000_000;
        const expected = truncated.toString().padStart(6, "0");
        // Timing-safe comparison
        if (timingSafeEqual(code, expected)) {
          return ok(true);
        }
      }
      return ok(false);
    } catch (e: unknown) {
      return err(internal("TOTP verification failed", e));
    }
  },
});

/** Timing-safe string comparison */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};
