import { describe, it, expect } from "bun:test";
import { createPasswordHasher } from "../../src/infrastructure/security/password-hasher.js";

describe("PasswordHasher (Argon2id)", () => {
  const hasher = createPasswordHasher();

  it("hashes and verifies a password", async () => {
    const hResult = await hasher.hash("SecureP@ss123");
    expect(hResult.ok).toBe(true);
    if (!hResult.ok) return;

    const vResult = await hasher.verify("SecureP@ss123", hResult.value);
    expect(vResult.ok).toBe(true);
    if (vResult.ok) expect(vResult.value).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hResult = await hasher.hash("CorrectPassword");
    expect(hResult.ok).toBe(true);
    if (!hResult.ok) return;

    const vResult = await hasher.verify("WrongPassword", hResult.value);
    expect(vResult.ok).toBe(true);
    if (vResult.ok) expect(vResult.value).toBe(false);
  });

  it("produces different hashes for same input", async () => {
    const a = await hasher.hash("same");
    const b = await hasher.hash("same");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value).not.toBe(b.value);
  });
});
