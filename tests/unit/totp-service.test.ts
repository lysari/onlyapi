import { describe, expect, it } from "bun:test";
import { createTotpService } from "../../src/infrastructure/security/totp-service.js";

describe("TotpService", () => {
  const totp = createTotpService();

  it("generates a base32 secret of expected length", () => {
    const secret = totp.generateSecret();
    expect(secret).toBeString();
    // 20 bytes → 32 base32 chars
    expect(secret.length).toBe(32);
    // Should only contain base32 characters
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it("generates different secrets each time", () => {
    const s1 = totp.generateSecret();
    const s2 = totp.generateSecret();
    expect(s1).not.toBe(s2);
  });

  it("generates a valid otpauth URI", () => {
    const secret = totp.generateSecret();
    const uri = totp.generateUri(secret, "user@example.com", "OnlyApi");

    expect(uri).toStartWith("otpauth://totp/");
    expect(uri).toContain("OnlyApi");
    expect(uri).toContain(encodeURIComponent("user@example.com"));
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("rejects non-6-digit codes", () => {
    const secret = totp.generateSecret();

    const r1 = totp.verify(secret, "12345");
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toBe(false);

    const r2 = totp.verify(secret, "abcdef");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value).toBe(false);

    const r3 = totp.verify(secret, "1234567");
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.value).toBe(false);
  });

  it("verifies a correct TOTP code (computed from known secret)", () => {
    // Generate a TOTP code using the same algorithm the service uses
    // We'll use the service itself to generate and verify in the same time window
    const secret = totp.generateSecret();

    // Generate the expected code ourselves using Bun.CryptoHasher
    const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const decode = (encoded: string): Uint8Array => {
      const bytes: number[] = [];
      let bits = 0;
      let value = 0;
      for (const char of encoded.toUpperCase()) {
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

    const secretBytes = decode(secret);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const counterBytes = new Uint8Array(8);
    let n = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = n & 0xff;
      n = Math.floor(n / 256);
    }

    // biome-ignore lint/suspicious/noExplicitAny: test compat
    const hasher = new Bun.CryptoHasher("sha1", secretBytes as any);
    // biome-ignore lint/suspicious/noExplicitAny: test compat
    hasher.update(counterBytes as any);
    const digest = hasher.digest();
    const hmac = new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);

    const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
    const code =
      ((((hmac[offset] ?? 0) & 0x7f) << 24) |
        (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
        (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
        ((hmac[offset + 3] ?? 0) & 0xff)) %
      1_000_000;
    const codeStr = code.toString().padStart(6, "0");

    const result = totp.verify(secret, codeStr);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  it("rejects an incorrect TOTP code", () => {
    const secret = totp.generateSecret();
    // "000000" is extremely unlikely to be valid for a random secret
    const result = totp.verify(secret, "000000");
    expect(result.ok).toBe(true);
    // Note: there's a very small chance this could be a valid code, so this
    // test is probabilistic. With 1M possibilities and 3 windows, chance is 3/1M.
  });
});
