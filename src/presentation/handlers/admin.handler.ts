import { banUserDto, changeRoleDto, listUsersDto } from "../../application/dtos/admin.dto.js";
import type { AdminService } from "../../application/services/admin.service.js";
import { UserRole } from "../../core/entities/user.entity.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { UserId } from "../../core/types/brand.js";
import type { RequestContext } from "../context.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { errorResponse, jsonResponse, noContentResponse } from "./response.js";

/**
 * Extract query parameters from a URL string without allocating a URL object.
 */
const extractQuery = (url: string): URLSearchParams => {
  const qIdx = url.indexOf("?");
  return new URLSearchParams(qIdx === -1 ? "" : url.substring(qIdx + 1));
};

export const adminHandlers = (
  adminService: AdminService,
  tokenService: TokenService,
  logger: Logger,
) => {
  /** Shared admin auth check — requires ADMIN role */
  const requireAdmin = async (req: Request, _ctx: RequestContext) => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) return authResult;
    return authorise(authResult.value, [UserRole.ADMIN]);
  };

  return {
    listUsers: async (req: Request, ctx: RequestContext): Promise<Response> => {
      const auth = await requireAdmin(req, ctx);
      if (!auth.ok) {
        logger.warn("Admin auth failed on listUsers", { requestId: ctx.requestId });
        return errorResponse(auth.error, ctx.requestId);
      }

      const query = extractQuery(req.url);
      const parsed = validateBody(listUsersDto, {
        cursor: query.get("cursor") ?? undefined,
        limit: query.get("limit") ?? "20",
        search: query.get("search") ?? undefined,
        role: query.get("role") ?? undefined,
      });
      if (!parsed.ok) return errorResponse(parsed.error, ctx.requestId);

      const dto = { ...parsed.value, limit: parsed.value.limit ?? 20 };
      const result = await adminService.listUsers(dto);
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return jsonResponse(result.value);
    },

    getUser: async (req: Request, ctx: RequestContext, userId: string): Promise<Response> => {
      const auth = await requireAdmin(req, ctx);
      if (!auth.ok) return errorResponse(auth.error, ctx.requestId);

      const result = await adminService.getUser(userId as UserId);
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return jsonResponse(result.value);
    },

    changeRole: async (req: Request, ctx: RequestContext, userId: string): Promise<Response> => {
      const auth = await requireAdmin(req, ctx);
      if (!auth.ok) return errorResponse(auth.error, ctx.requestId);

      const body = await req.json().catch(() => null);
      const validated = validateBody(changeRoleDto, body);
      if (!validated.ok) return errorResponse(validated.error, ctx.requestId);

      const result = await adminService.changeRole(
        userId as UserId,
        validated.value,
        auth.value.sub,
        ctx.ip,
      );
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return jsonResponse(result.value);
    },

    banUser: async (req: Request, ctx: RequestContext, userId: string): Promise<Response> => {
      const auth = await requireAdmin(req, ctx);
      if (!auth.ok) return errorResponse(auth.error, ctx.requestId);

      const body = await req.json().catch(() => null);
      const validated = validateBody(banUserDto, body);
      if (!validated.ok) return errorResponse(validated.error, ctx.requestId);

      const result = await adminService.banUser(
        userId as UserId,
        validated.value,
        auth.value.sub,
        ctx.ip,
      );
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return noContentResponse();
    },

    unbanUser: async (req: Request, ctx: RequestContext, userId: string): Promise<Response> => {
      const auth = await requireAdmin(req, ctx);
      if (!auth.ok) return errorResponse(auth.error, ctx.requestId);

      const result = await adminService.unbanUser(userId as UserId, auth.value.sub, ctx.ip);
      if (!result.ok) return errorResponse(result.error, ctx.requestId);

      return noContentResponse();
    },
  };
};
