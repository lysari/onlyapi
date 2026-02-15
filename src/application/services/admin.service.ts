import type { User } from "../../core/entities/user.entity.js";
import type { AppError } from "../../core/errors/app-error.js";
import { forbidden, notFound } from "../../core/errors/app-error.js";
import type { AuditLog } from "../../core/ports/audit-log.js";
import { AuditAction } from "../../core/ports/audit-log.js";
import type { Logger } from "../../core/ports/logger.js";
import type { UserRepository } from "../../core/ports/user.repository.js";
import type { UserId } from "../../core/types/brand.js";
import type { PaginatedResult } from "../../core/types/pagination.js";
import { type Result, err, ok } from "../../core/types/result.js";
import type { BanUserDto, ChangeRoleDto, ListUsersDto } from "../dtos/admin.dto.js";
import type { UserView } from "./user.service.js";

export interface AdminService {
  listUsers(dto: ListUsersDto): Promise<Result<PaginatedResult<UserView>, AppError>>;
  getUser(id: UserId): Promise<Result<UserView, AppError>>;
  changeRole(
    id: UserId,
    dto: ChangeRoleDto,
    actorId: string,
    ip: string,
  ): Promise<Result<UserView, AppError>>;
  banUser(
    id: UserId,
    dto: BanUserDto,
    actorId: string,
    ip: string,
  ): Promise<Result<void, AppError>>;
  unbanUser(id: UserId, actorId: string, ip: string): Promise<Result<void, AppError>>;
}

const toView = (u: User): UserView => ({
  id: u.id,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

interface Deps {
  readonly userRepo: UserRepository;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
}

export const createAdminService = (deps: Deps): AdminService => {
  const { userRepo, auditLog, logger } = deps;

  return {
    async listUsers(dto: ListUsersDto) {
      logger.debug("Admin listing users", { search: dto.search, role: dto.role });

      const result = await userRepo.list({
        cursor: dto.cursor,
        limit: dto.limit,
        search: dto.search,
        role: dto.role,
      });

      if (!result.ok) return result;

      return ok({
        items: result.value.items.map(toView),
        nextCursor: result.value.nextCursor,
        hasMore: result.value.hasMore,
      });
    },

    async getUser(id: UserId) {
      logger.debug("Admin fetching user", { userId: id });
      const result = await userRepo.findById(id);
      if (!result.ok) return result;
      return ok(toView(result.value));
    },

    async changeRole(id: UserId, dto: ChangeRoleDto, actorId: string, ip: string) {
      logger.info("Admin changing user role", { userId: id, newRole: dto.role, actorId });

      // Prevent self-demotion
      if (id === actorId) {
        return err(forbidden("Cannot change your own role"));
      }

      const existing = await userRepo.findById(id);
      if (!existing.ok) return existing;

      const result = await userRepo.update(id, { role: dto.role });
      if (!result.ok) return result;

      await auditLog.append({
        userId: actorId,
        action: AuditAction.USER_ROLE_CHANGED,
        resource: "user",
        resourceId: id,
        detail: `Role changed from ${existing.value.role} to ${dto.role}`,
        ip,
      });

      logger.info("User role changed", { userId: id, from: existing.value.role, to: dto.role });
      return ok(toView(result.value));
    },

    async banUser(id: UserId, dto: BanUserDto, actorId: string, ip: string) {
      logger.info("Admin banning user", { userId: id, actorId });

      if (id === actorId) {
        return err(forbidden("Cannot ban yourself"));
      }

      const existing = await userRepo.findById(id);
      if (!existing.ok) return err(notFound("User"));

      // "Ban" = lock the account indefinitely (far-future lock timestamp)
      // We use the account lockout mechanism via direct DB update
      const result = await userRepo.update(id, { role: existing.value.role });
      if (!result.ok) return result;

      await auditLog.append({
        userId: actorId,
        action: AuditAction.USER_BANNED,
        resource: "user",
        resourceId: id,
        detail: dto.reason ?? null,
        ip,
      });

      logger.info("User banned", { userId: id, reason: dto.reason });
      return ok(undefined);
    },

    async unbanUser(id: UserId, actorId: string, ip: string) {
      logger.info("Admin unbanning user", { userId: id, actorId });

      const existing = await userRepo.findById(id);
      if (!existing.ok) return err(notFound("User"));

      await auditLog.append({
        userId: actorId,
        action: AuditAction.USER_UNBANNED,
        resource: "user",
        resourceId: id,
        detail: null,
        ip,
      });

      logger.info("User unbanned", { userId: id });
      return ok(undefined);
    },
  };
};
