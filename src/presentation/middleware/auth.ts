import type { TokenService, TokenPayload } from "../../core/ports/token-service.js";
import type { AppError } from "../../core/errors/app-error.js";
import { unauthorized } from "../../core/errors/app-error.js";
import { err, type Result } from "../../core/types/result.js";
import type { UserRole } from "../../core/entities/user.entity.js";

/**
 * Extracts and verifies the Bearer token from the Authorization header.
 */
export const authenticate = async (
  req: Request,
  tokenService: TokenService,
): Promise<Result<TokenPayload, AppError>> => {
  const header = req.headers.get("authorization");
  if (!header) return err(unauthorized("Missing Authorization header"));

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return err(unauthorized("Invalid Authorization header format"));
  }

  const token = parts[1];
  if (!token) return err(unauthorized("Missing token"));

  return tokenService.verify(token);
};

/**
 * Role guard — call after authentication.
 */
export const authorise = (
  payload: TokenPayload,
  allowedRoles: readonly UserRole[],
): Result<TokenPayload, AppError> => {
  if (!allowedRoles.includes(payload.role)) {
    return err(unauthorized("Insufficient permissions"));
  }
  return { ok: true, value: payload };
};
