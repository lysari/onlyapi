import type { ZodSchema } from "zod";
import { validation, type AppError } from "../../core/errors/app-error.js";
import { ok, err, type Result } from "../../core/types/result.js";

/**
 * Validate an unknown body against a Zod schema.
 * Returns a typed Result — never throws.
 */
export const validateBody = <T>(schema: ZodSchema<T>, body: unknown): Result<T, AppError> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.flatten();
    return err(validation(issues as unknown as Record<string, unknown>));
  }
  return ok(result.data);
};
