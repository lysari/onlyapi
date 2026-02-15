import { oauthCallbackDto } from "../../application/dtos/auth.dto.js";
import type { AuthService } from "../../application/services/auth.service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { OAuthProvider } from "../../core/ports/oauth.js";
import type { RequestContext } from "../context.js";
import { validateBody } from "../middleware/validate.js";
import { errorResponse, jsonResponse } from "./response.js";

export const oauthHandlers = (
  authService: AuthService,
  oauthProviders: ReadonlyMap<string, OAuthProvider>,
  logger: Logger,
) => ({
  /**
   * GET /api/v1/auth/oauth/:provider — redirect to provider's authorization URL
   */
  authorize: async (_req: Request, ctx: RequestContext, provider: string): Promise<Response> => {
    const oauthProvider = oauthProviders.get(provider);
    if (!oauthProvider) {
      const body = `{"error":{"code":"NOT_FOUND","message":"Unknown provider: ${provider}"}}`;
      return new Response(body, {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Generate a state parameter for CSRF protection
    const state = crypto.randomUUID();
    const redirectUri = `${ctx.path.replace(`/oauth/${provider}`, `/oauth/${provider}/callback`)}`;

    const url = oauthProvider.getAuthorizationUrl(state, redirectUri);
    logger.info("OAuth redirect", { provider, requestId: ctx.requestId });

    return new Response(null, {
      status: 302,
      headers: { Location: url },
    });
  },

  /**
   * POST /api/v1/auth/oauth/:provider/callback — exchange code for tokens
   */
  callback: async (req: Request, ctx: RequestContext, provider: string): Promise<Response> => {
    const body = await req.json().catch(() => null);
    const validated = validateBody(oauthCallbackDto, body);
    if (!validated.ok) return errorResponse(validated.error, ctx.requestId);

    const redirectUri = `${ctx.path}`;
    const result = await authService.oauthLogin(provider, validated.value.code, redirectUri);
    if (!result.ok) {
      logger.warn("OAuth callback failed", {
        provider,
        requestId: ctx.requestId,
        code: result.error.code,
      });
      return errorResponse(result.error, ctx.requestId);
    }

    return jsonResponse(result.value);
  },
});
