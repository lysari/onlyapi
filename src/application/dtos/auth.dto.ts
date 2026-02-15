import { z } from "zod";

/** DTOs validated at the edge via Zod — never trust input */

export const registerDto = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const loginDto = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const refreshDto = z.object({
  refreshToken: z.string().min(1),
});

export const updateUserDto = z.object({
  email: z.string().email().max(255).trim().toLowerCase().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const logoutDto = z.object({
  refreshToken: z.string().min(1),
});

// ── v1.4 — Auth Platform DTOs ──

export const verifyEmailDto = z.object({
  token: z.string().min(1),
});

export const forgotPasswordDto = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
});

export const resetPasswordDto = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const mfaSetupDto = z.object({}); // no body needed — uses auth context

export const mfaEnableDto = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "Code must be 6 digits"),
  secret: z.string().min(1),
});

export const mfaDisableDto = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const mfaVerifyDto = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "Code must be 6 digits"),
  mfaToken: z.string().min(1), // partial auth token from login
});

export const oauthCallbackDto = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const createApiKeyDto = z.object({
  name: z.string().min(1).max(100).trim(),
  scopes: z.array(z.string().min(1).max(50)).max(20).default([]),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const revokeApiKeyDto = z.object({
  id: z.string().min(1),
});

export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type RefreshDto = z.infer<typeof refreshDto>;
export type UpdateUserDto = z.infer<typeof updateUserDto>;
export type LogoutDto = z.infer<typeof logoutDto> & { accessToken: string };
export type VerifyEmailDto = z.infer<typeof verifyEmailDto>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordDto>;
export type ResetPasswordDto = z.infer<typeof resetPasswordDto>;
export type MfaSetupDto = z.infer<typeof mfaSetupDto>;
export type MfaEnableDto = z.infer<typeof mfaEnableDto>;
export type MfaDisableDto = z.infer<typeof mfaDisableDto>;
export type MfaVerifyDto = z.infer<typeof mfaVerifyDto>;
export type OAuthCallbackDto = z.infer<typeof oauthCallbackDto>;
export type CreateApiKeyDto = z.infer<typeof createApiKeyDto>;
export type RevokeApiKeyDto = z.infer<typeof revokeApiKeyDto>;
