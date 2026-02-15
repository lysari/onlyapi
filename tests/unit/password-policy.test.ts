import { describe, expect, it } from "bun:test";
import type { PasswordHistory } from "../../src/core/ports/password-history.js";
import { brand } from "../../src/core/types/brand.js";
import type { UserId } from "../../src/core/types/brand.js";
import { ok } from "../../src/core/types/result.js";
import { createPasswordHasher } from "../../src/infrastructure/security/password-hasher.js";
import { createPasswordPolicy } from "../../src/infrastructure/security/password-policy.js";

const userId = brand<string, "UserId">("user-1") as UserId;

describe("PasswordPolicy", () => {
  describe("validate", () => {
    it("accepts a valid password with all requirements", () => {
      const policy = createPasswordPolicy({
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("Test1234!");
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it("rejects password shorter than minLength", () => {
      const policy = createPasswordPolicy({
        minLength: 12,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("short");
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain("12 characters");
    });

    it("rejects password missing uppercase", () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: true,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("lowercase1!");
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain("uppercase");
    });

    it("rejects password missing lowercase", () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: true,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("UPPERCASE1!");
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain("lowercase");
    });

    it("rejects password missing digit", () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: true,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("NoDigitHere!");
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain("digit");
    });

    it("rejects password missing special character", () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: true,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("NoSpecial1");
      expect(result.valid).toBe(false);
      expect(result.violations[0]).toContain("special");
    });

    it("returns multiple violations at once", () => {
      const policy = createPasswordPolicy({
        minLength: 20,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const result = policy.validate("a");
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("checkHistory", () => {
    it("returns true when password matches recent history", async () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 5,
        maxAgeDays: 0,
      });

      const passwordHasher = createPasswordHasher();
      const hash = await passwordHasher.hash("OldPassword1");
      if (!hash.ok) return;

      const mockHistory: PasswordHistory = {
        add: async () => ok(undefined),
        getRecent: async () => ok([hash.value]),
        prune: async () => ok(undefined),
      };

      const result = await policy.checkHistory(userId, "OldPassword1", passwordHasher, mockHistory);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    it("returns false when password is not in history", async () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 5,
        maxAgeDays: 0,
      });

      const passwordHasher = createPasswordHasher();
      const hash = await passwordHasher.hash("OldPassword1");
      if (!hash.ok) return;

      const mockHistory: PasswordHistory = {
        add: async () => ok(undefined),
        getRecent: async () => ok([hash.value]),
        prune: async () => ok(undefined),
      };

      const result = await policy.checkHistory(userId, "NewPassword2", passwordHasher, mockHistory);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });

    it("skips check when historyCount is 0", async () => {
      const policy = createPasswordPolicy({
        minLength: 1,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      const passwordHasher = createPasswordHasher();
      const mockHistory: PasswordHistory = {
        add: async () => ok(undefined),
        getRecent: async () => ok([]),
        prune: async () => ok(undefined),
      };

      const result = await policy.checkHistory(userId, "anything", passwordHasher, mockHistory);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("returns false when maxAgeDays is 0", () => {
      const policy = createPasswordPolicy({
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 0,
      });

      expect(policy.isExpired(Date.now() - 365 * 24 * 60 * 60 * 1000)).toBe(false);
    });

    it("returns false when passwordChangedAt is null", () => {
      const policy = createPasswordPolicy({
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 90,
      });

      expect(policy.isExpired(null)).toBe(false);
    });

    it("returns true when password is older than maxAgeDays", () => {
      const policy = createPasswordPolicy({
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 30,
      });

      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      expect(policy.isExpired(thirtyOneDaysAgo)).toBe(true);
    });

    it("returns false when password is newer than maxAgeDays", () => {
      const policy = createPasswordPolicy({
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireDigit: false,
        requireSpecial: false,
        historyCount: 0,
        maxAgeDays: 30,
      });

      const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
      expect(policy.isExpired(oneDayAgo)).toBe(false);
    });
  });
});
