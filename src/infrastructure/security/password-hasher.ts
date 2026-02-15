import { type AppError, internal } from "../../core/errors/app-error.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * Bun-native password hasher using Argon2id via Bun.password.
 * Zero external dependencies — Bun ships Argon2 in its runtime.
 */
export const createPasswordHasher = (): PasswordHasher => ({
  async hash(plain: string): Promise<Result<string, AppError>> {
    try {
      const hashed = await Bun.password.hash(plain, {
        algorithm: "argon2id",
        memoryCost: 65536, // 64 MiB
        timeCost: 3,
      });
      return ok(hashed);
    } catch (e: unknown) {
      return err(internal("Failed to hash password", e));
    }
  },

  async verify(plain: string, hash: string): Promise<Result<boolean, AppError>> {
    try {
      const matches = await Bun.password.verify(plain, hash);
      return ok(matches);
    } catch (e: unknown) {
      return err(internal("Failed to verify password", e));
    }
  },
});
