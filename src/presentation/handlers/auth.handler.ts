import type { AuthService } from "../../application/services/auth.service.js";
import type { Logger } from "../../core/ports/logger.js";
import { registerDto, loginDto, refreshDto } from "../../application/dtos/auth.dto.js";
import { validateBody } from "../middleware/validate.js";
import { errorResponse, createdResponse, jsonResponse } from "./response.js";
import type { RequestContext } from "../context.js";

export const authHandlers = (authService: AuthService, logger: Logger) => ({
  register: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const body = await req.json().catch(() => null);
    const validated = validateBody(registerDto, body);
    if (!validated.ok) {
      logger.warn("Registration validation failed", { requestId: ctx.requestId, code: validated.error.code });
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
      logger.warn("Login validation failed", { requestId: ctx.requestId, code: validated.error.code });
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
      logger.warn("Refresh validation failed", { requestId: ctx.requestId, code: validated.error.code });
      return errorResponse(validated.error, ctx.requestId);
    }

    const result = await authService.refresh(validated.value);
    if (!result.ok) {
      logger.warn("Token refresh failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },
});
