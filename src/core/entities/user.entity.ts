import type { UserId, Timestamp } from "../types/index.js";

/**
 * User entity — pure data, no behaviour, no framework deps.
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export const UserRole = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
