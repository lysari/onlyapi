import { createApiKeyDto } from "../../application/dtos/auth.dto.js";
import type { ApiKeyService } from "../../application/services/api-key.service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { TokenService } from "../../core/ports/token-service.js";
import type { RequestContext } from "../context.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createdResponse, errorResponse, jsonResponse, noContentResponse } from "./response.js";

export const apiKeyHandlers = (
  apiKeyService: ApiKeyService,
  tokenService: TokenService,
  logger: Logger,
) => ({
  create: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

    const body = await req.json().catch(() => null);
    const validated = validateBody(createApiKeyDto, body);
    if (!validated.ok) return errorResponse(validated.error, ctx.requestId);

    const result = await apiKeyService.create(
      authResult.value.sub,
      validated.value.name,
      validated.value.scopes ?? [],
      validated.value.expiresInDays,
    );
    if (!result.ok) return errorResponse(result.error, ctx.requestId);

    logger.info("API key created", {
      requestId: ctx.requestId,
      userId: authResult.value.sub,
      keyId: result.value.key.id,
    });

    return createdResponse({
      key: result.value.key,
      rawKey: result.value.rawKey,
    });
  },

  list: async (req: Request, ctx: RequestContext): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

    const result = await apiKeyService.list(authResult.value.sub);
    if (!result.ok) return errorResponse(result.error, ctx.requestId);

    return jsonResponse({ keys: result.value });
  },

  revoke: async (req: Request, ctx: RequestContext, keyId: string): Promise<Response> => {
    const authResult = await authenticate(req, tokenService);
    if (!authResult.ok) return errorResponse(authResult.error, ctx.requestId);

    const result = await apiKeyService.revoke(keyId, authResult.value.sub);
    if (!result.ok) return errorResponse(result.error, ctx.requestId);

    logger.info("API key revoked", {
      requestId: ctx.requestId,
      userId: authResult.value.sub,
      keyId,
    });

    return noContentResponse();
  },
});
