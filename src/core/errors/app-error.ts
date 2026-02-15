/**
 * Canonical application error — every failure in the system is expressed
 * as an AppError so HTTP, logging, and metrics layers have a single shape.
 */

export const ErrorCode = {
  // Client errors
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION: "VALIDATION",
  // Server errors
  INTERNAL: "INTERNAL",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

const STATUS_MAP: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  VALIDATION: 422,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT: 504,
};

export const httpStatus = (code: ErrorCode): number => STATUS_MAP[code];

/** Factory helpers */
export const appError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): AppError => {
  const error: AppError = { code, message };
  if (details !== undefined) {
    return { ...error, details, cause };
  }
  if (cause !== undefined) {
    return { ...error, cause };
  }
  return error;
};

export const badRequest = (msg: string, details?: Record<string, unknown>): AppError =>
  appError(ErrorCode.BAD_REQUEST, msg, details);

export const unauthorized = (msg = "Unauthorized"): AppError =>
  appError(ErrorCode.UNAUTHORIZED, msg);

export const forbidden = (msg = "Forbidden"): AppError => appError(ErrorCode.FORBIDDEN, msg);

export const notFound = (resource: string): AppError =>
  appError(ErrorCode.NOT_FOUND, `${resource} not found`);

export const conflict = (msg: string): AppError => appError(ErrorCode.CONFLICT, msg);

export const rateLimited = (): AppError => appError(ErrorCode.RATE_LIMITED, "Too many requests");

export const validation = (details: Record<string, unknown>): AppError =>
  appError(ErrorCode.VALIDATION, "Validation failed", details);

export const internal = (msg = "Internal server error", cause?: unknown): AppError =>
  appError(ErrorCode.INTERNAL, msg, undefined, cause);
