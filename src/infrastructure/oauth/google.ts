import { type AppError, internal, unauthorized } from "../../core/errors/app-error.js";
import type { OAuthProvider, OAuthUserInfo } from "../../core/ports/oauth.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * Google OAuth2 provider adapter.
 * Uses Google's OAuth 2.0 endpoints for authorization code flow.
 * Zero external dependencies — uses native fetch.
 */

interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export const createGoogleOAuthProvider = (config: GoogleOAuthConfig): OAuthProvider => ({
  name: "google",

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<Result<OAuthUserInfo, AppError>> {
    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenRes.ok) {
        return err(unauthorized("Failed to exchange authorization code with Google"));
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return err(unauthorized("No access token in Google response"));
      }

      // Fetch user info
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return err(unauthorized("Failed to fetch Google user info"));
      }

      const userData = (await userRes.json()) as {
        id?: string;
        email?: string;
        name?: string;
      };

      if (!userData.id || !userData.email) {
        return err(unauthorized("Incomplete Google user info"));
      }

      return ok({
        providerId: userData.id,
        email: userData.email,
        ...(userData.name ? { name: userData.name } : {}),
      });
    } catch (e: unknown) {
      return err(internal("Google OAuth exchange failed", e));
    }
  },
});
