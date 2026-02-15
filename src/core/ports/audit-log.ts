import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

/**
 * Port: Audit Log — append-only ledger of significant system events.
 * Records who did what, when, and from which IP address.
 */

export interface AuditEntry {
  readonly id: string;
  readonly userId: string | null;
  readonly action: AuditAction;
  readonly resource: string;
  readonly resourceId: string | null;
  readonly detail: string | null;
  readonly ip: string;
  readonly timestamp: number;
}

export const AuditAction = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGGED_IN: "USER_LOGGED_IN",
  USER_LOGGED_OUT: "USER_LOGGED_OUT",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
  USER_BANNED: "USER_BANNED",
  USER_UNBANNED: "USER_UNBANNED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  TOKEN_REFRESHED: "TOKEN_REFRESHED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLog {
  append(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<Result<void, AppError>>;
  query(options: AuditQueryOptions): Promise<Result<readonly AuditEntry[], AppError>>;
}

export interface AuditQueryOptions {
  readonly userId?: string | undefined;
  readonly action?: AuditAction | undefined;
  readonly limit?: number | undefined;
  readonly since?: number | undefined;
}
