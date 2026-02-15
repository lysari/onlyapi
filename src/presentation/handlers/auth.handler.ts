import { loginDto, logoutDto, refreshDto, registerDto } from "../../application/dtos/auth.dto.js";
import type { AuthService } from "../../application/services/auth.service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { RequestContext } from "../context.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createdResponse, errorResponse, jsonResponse, noContentResponse } from "./response.js";

export const authHandlers = (
  authService: AuthService,
  tokenService: TokenService,
  logger: Logger,
) => ({
  register: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const body = await req.json().catch(() => null);
    const validated = validateBody(registerDto, body);
    if (!validated.ok) {
      logger.warn("Registration validation failed", {
        requestId: ctx.requestId,
        code: validated.error.code,
      });
      return errorResponse(validated.error, ctx.requestId);
    }

    const result = await authService.register(validated.value);
    if (!result.ok) {
      logger.warn("Registration failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return createdResponse(result.value);
  },

  login: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const body = await req.json().catch(() => null);
    const validated = validateBody(loginDto, body);
    if (!validated.ok) {
      logger.warn("Login validation failed", {
        requestId: ctx.requestId,
        code: validated.error.code,
      });
      return errorResponse(validated.error, ctx.requestId);
    }

    const result = await authService.login(validated.value);
    if (!result.ok) {
      logger.warn("Login failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },

  refresh: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const body = await req.json().catch(() => null);
    const validated = validateBody(refreshDto, body);
    if (!validated.ok) {
      logger.warn("Refresh validation failed", {
        requestId: ctx.requestId,
        code: validated.error.code,
      });
      return errorResponse(validated.error, ctx.requestId);
    }

    const result = await authService.refresh(validated.value);
    if (!result.ok) {
      logger.warn("Token refresh failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },

  logout: async (req: Request, ctx: RequestContext): Promise<Response> => {
    // Authenticate the request first
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) {
      logger.warn("Auth failed on logout", {
        requestId: ctx.requestId,
        code: authResult.error.code,
      });
      return errorResponse(authResult.error, ctx.requestId);
    }

    const body = await req.json().catch(() => null);
    const validated = validateBody(logoutDto, body);
    if (!validated.ok) {
      logger.warn("Logout validation failed", {
        requestId: ctx.requestId,
        code: validated.error.code,
      });
      return errorResponse(validated.error, ctx.requestId);
    }

    // Extract the access token from the Authorization header
    const authHeader = req.headers.get("authorization") ?? "";
    const accessToken = authHeader.split(" ")[1] ?? "";

    const result = await authService.logout({
      ...validated.value,
      accessToken,
    });
    if (!result.ok) {
      logger.warn("Logout failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return noContentResponse();
  },
});
