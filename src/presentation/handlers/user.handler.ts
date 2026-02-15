import { updateUserDto } from "../../application/dtos/auth.dto.js";
import type { UserService } from "../../application/services/user.service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { RequestContext } from "../context.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { errorResponse, jsonResponse, noContentResponse } from "./response.js";

export const userHandlers = (
  userService: UserService,
  tokenService: TokenService,
  logger: Logger,
) => ({
  getMe: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) {
      logger.warn("Auth failed on getMe", {
        requestId: ctx.requestId,
        code: authResult.error.code,
      });
      return errorResponse(authResult.error, ctx.requestId);
    }

    const result = await userService.getById(authResult.value.sub);
    if (!result.ok) {
      logger.warn("getMe failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },

  updateMe: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) {
      logger.warn("Auth failed on updateMe", {
        requestId: ctx.requestId,
        code: authResult.error.code,
      });
      return errorResponse(authResult.error, ctx.requestId);
    }

    const body = await req.json().catch(() => null);
    const validated = validateBody(updateUserDto, body);
    if (!validated.ok) {
      logger.warn("Update validation failed", {
        requestId: ctx.requestId,
        code: validated.error.code,
      });
      return errorResponse(validated.error, ctx.requestId);
    }

    const result = await userService.update(authResult.value.sub, validated.value);
    if (!result.ok) {
      logger.warn("updateMe failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },

  deleteMe: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) {
      logger.warn("Auth failed on deleteMe", {
        requestId: ctx.requestId,
        code: authResult.error.code,
      });
      return errorResponse(authResult.error, ctx.requestId);
    }

    const result = await userService.remove(authResult.value.sub);
    if (!result.ok) {
      logger.warn("deleteMe failed", { requestId: ctx.requestId, code: result.error.code });
      return errorResponse(result.error, ctx.requestId);
    }

    return noContentResponse();
  },
});
