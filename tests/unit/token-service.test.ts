import { describe, it, expect } from "bun:test";
import { createTokenService } from "../../src/infrastructure/security/token-service.js";
import { brand, type UserId } from "../../src/core/types/brand.js";
import type { UserRole } from "../../src/core/entities/user.entity.js";

describe("TokenService (JWT)", () => {
  const service = createTokenService({
    secret: "a-very-long-secret-that-is-at-least-32-chars!!",
    expiresIn: "15m",
    refreshExpiresIn: "7d",
  });

  const payload = {
    sub: brand<string, "UserId">("user-123") as UserId,
    role: "user" as UserRole,
  };

  it("signs and verifies an access token", async () => {
    const signResult = await service.sign(payload);
    expect(signResult.ok).toBe(true);
    if (!signResult.ok) return;

    const { accessToken } = signResult.value;
    expect(typeof accessToken).toBe("string");

    const verifyResult = await service.verify(accessToken);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.value.sub).toBe("user-123" as UserId);
      expect(verifyResult.value.role).toBe("user");
    }
  });

  it("refresh returns new token pair", async () => {
    const signResult = await service.sign(payload);
    expect(signResult.ok).toBe(true);
    if (!signResult.ok) return;

    const refreshResult = await service.refresh(signResult.value.refreshToken);
    expect(refreshResult.ok).toBe(true);
    if (refreshResult.ok) {
      expect(refreshResult.value.accessToken).toBeTruthy();
      expect(refreshResult.value.refreshToken).toBeTruthy();
    }
  });

  it("rejects tampered tokens", async () => {
    const result = await service.verify("invalid.token.here");
    expect(result.ok).toBe(false);
  });
});
