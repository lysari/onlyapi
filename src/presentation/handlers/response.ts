import type { AppError } from "../../core/errors/app-error.js";
import { httpStatus } from "../../core/errors/app-error.js";

/**
 * Serialise an AppError into a JSON response. Never leaks internals.
 */
export const errorResponse = (error: AppError, requestId: string): Response => {
  const status = httpStatus(error.code);
  const body: Record<string, unknown> = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    requestId,
  };

  return Response.json(body, { status });
};

/** Success response helper */
export const jsonResponse = <T>(data: T, status = 200): Response =>
  Response.json({ data }, { status });

/** 201 Created */
export const createdResponse = <T>(data: T): Response => Response.json({ data }, { status: 201 });

/** 204 No Content */
export const noContentResponse = (): Response => new Response(null, { status: 204 });
