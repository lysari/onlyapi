import { type AppError, internal, unauthorized } from "../../core/errors/app-error.js";
import type { OAuthProvider, OAuthUserInfo } from "../../core/ports/oauth.js";
import { type Result, err, ok } from "../../core/types/result.js";

/**
 * GitHub OAuth2 provider adapter.
 * Uses GitHub's OAuth App endpoints for authorization code flow.
 * Zero external dependencies — uses native fetch.
 */

interface GitHubOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export const createGitHubOAuthProvider = (config: GitHubOAuthConfig): OAuthProvider => ({
  name: "github",

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: "user:email",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OAuth code exchange is inherently complex
  async exchangeCode(code: string, redirectUri: string): Promise<Result<OAuthUserInfo, AppError>> {
    try {
      // Exchange authorization code for access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        return err(unauthorized("Failed to exchange authorization code with GitHub"));
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };
      if (tokenData.error || !tokenData.access_token) {
        return err(unauthorized(tokenData.error ?? "No access token in GitHub response"));
      }

      // Fetch user info
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "onlyApi",
        },
      });

      if (!userRes.ok) {
        return err(unauthorized("Failed to fetch GitHub user info"));
      }

      const userData = (await userRes.json()) as {
        id?: number;
        login?: string;
        name?: string;
      };

      if (!userData.id) {
        return err(unauthorized("Incomplete GitHub user info"));
      }

      // Fetch primary email (may not be public)
      let email: string | undefined;
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "onlyApi",
        },
      });

      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email = primary?.email;
      }

      if (!email) {
        return err(unauthorized("No verified email found on GitHub account"));
      }

      const displayName = userData.name ?? userData.login;
      return ok({
        providerId: String(userData.id),
        email,
        ...(displayName ? { name: displayName } : {}),
      });
    } catch (e: unknown) {
      return err(internal("GitHub OAuth exchange failed", e));
    }
  },
});
