import { z } from "zod";

/**
 * Admin DTOs — validated at the edge via Zod.
 * All admin endpoints require admin role.
 */

export const listUsersDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

export const changeRoleDto = z.object({
  role: z.enum(["admin", "user"]),
});

export const banUserDto = z.object({
  reason: z.string().max(500).optional(),
});

export type ListUsersDto = z.infer<typeof listUsersDto>;
export type ChangeRoleDto = z.infer<typeof changeRoleDto>;
export type BanUserDto = z.infer<typeof banUserDto>;
