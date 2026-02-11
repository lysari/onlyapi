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

export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type RefreshDto = z.infer<typeof refreshDto>;
export type UpdateUserDto = z.infer<typeof updateUserDto>;
