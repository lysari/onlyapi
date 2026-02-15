import type { ZodSchema } from "zod";
import { type AppError, validation } from "../../core/errors/app-error.js";
import { type Result, err, ok } from "../../core/types/result.js";

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
