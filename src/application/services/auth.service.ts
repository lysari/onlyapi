import { UserRole } from "../../core/entities/user.entity.js";
import type { AppError } from "../../core/errors/app-error.js";
import { forbidden, unauthorized } from "../../core/errors/app-error.js";
import type { AccountLockout } from "../../core/ports/account-lockout.js";
import type { Logger } from "../../core/ports/logger.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import type { TokenBlacklist } from "../../core/ports/token-blacklist.js";
import type { TokenPair, TokenPayload, TokenService } from "../../core/ports/token-service.js";
import type { UserRepository } from "../../core/ports/user.repository.js";
import { type Result, err, ok } from "../../core/types/result.js";
import type { LoginDto, LogoutDto, RefreshDto, RegisterDto } from "../dtos/auth.dto.js";

export interface AuthService {
  register(dto: RegisterDto): Promise<Result<TokenPair, AppError>>;
  login(dto: LoginDto): Promise<Result<TokenPair, AppError>>;
  refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>>;
  logout(dto: LogoutDto): Promise<Result<void, AppError>>;
}

interface Deps {
  readonly userRepo: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenService: TokenService;
  readonly tokenBlacklist: TokenBlacklist;
  readonly accountLockout: AccountLockout;
  readonly logger: Logger;
}

/** Hash a token for storage (never store raw tokens) */
const hashToken = async (token: string): Promise<string> => {
  const data = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const createAuthService = (deps: Deps): AuthService => {
  const { userRepo, passwordHasher, tokenService, tokenBlacklist, accountLockout, logger } = deps;

  return {
    async register(dto: RegisterDto): Promise<Result<TokenPair, AppError>> {
      logger.info("Registering user", { email: dto.email });

      const hashResult = await passwordHasher.hash(dto.password);
      if (!hashResult.ok) {
        logger.error("Password hashing failed during registration", { email: dto.email });
        return hashResult;
      }

      const createResult = await userRepo.create({
        email: dto.email,
        passwordHash: hashResult.value,
        role: UserRole.USER,
      });
      if (!createResult.ok) return createResult;

      const user = createResult.value;
      const tokenPayload: TokenPayload = { sub: user.id, role: user.role };
      const tokenResult = await tokenService.sign(tokenPayload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("User registered", { userId: user.id });
      return ok(tokenResult.value);
    },

    async login(dto: LoginDto): Promise<Result<TokenPair, AppError>> {
      logger.info("Login attempt", { email: dto.email });

      // Check account lockout
      const lockResult = await accountLockout.isLocked(dto.email);
      if (lockResult.ok && lockResult.value !== null) {
        const remainingMs = lockResult.value - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60_000);
        logger.warn("Login blocked — account locked", { email: dto.email, remainingMin });
        return err(forbidden(`Account locked. Try again in ${remainingMin} minute(s).`));
      }

      const findResult = await userRepo.findByEmail(dto.email);
      if (!findResult.ok) {
        // Record failed attempt even if user not found (prevent enumeration)
        await accountLockout.recordFailedAttempt(dto.email);
        logger.warn("Login failed — user not found", { email: dto.email });
        return err(unauthorized("Invalid credentials"));
      }

      const user = findResult.value;
      const verifyResult = await passwordHasher.verify(dto.password, user.passwordHash);
      if (!verifyResult.ok) return verifyResult;
      if (!verifyResult.value) {
        const locked = await accountLockout.recordFailedAttempt(dto.email);
        if (locked.ok && locked.value) {
          logger.warn("Account locked after failed attempts", { email: dto.email });
          return err(forbidden("Account locked due to too many failed attempts. Try again later."));
        }
        logger.warn("Login failed — invalid password", { email: dto.email });
        return err(unauthorized("Invalid credentials"));
      }

      // Successful login — reset lockout counter
      await accountLockout.resetAttempts(dto.email);

      const tokenPayload: TokenPayload = { sub: user.id, role: user.role };
      const tokenResult = await tokenService.sign(tokenPayload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("User logged in", { userId: user.id });
      return ok(tokenResult.value);
    },

    async refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>> {
      logger.debug("Token refresh attempt");

      // Check if refresh token is blacklisted
      const tokenHash = await hashToken(dto.refreshToken);
      const blacklisted = await tokenBlacklist.isBlacklisted(tokenHash);
      if (blacklisted.ok && blacklisted.value) {
        logger.warn("Refresh attempt with blacklisted token");
        return err(unauthorized("Token has been revoked"));
      }

      const result = await tokenService.refresh(dto.refreshToken);
      if (!result.ok) {
        logger.warn("Token refresh failed", { code: result.error.code });
        return result;
      }

      // Blacklist the old refresh token
      // Use 7 days as the expiry (conservative — matches refresh token TTL)
      await tokenBlacklist.add(tokenHash, Date.now() + 7 * 24 * 60 * 60 * 1000);

      logger.info("Token refreshed successfully");
      return result;
    },

    async logout(dto: LogoutDto): Promise<Result<void, AppError>> {
      logger.info("Logout attempt");

      // Blacklist both access and refresh tokens
      const [accessHash, refreshHash] = await Promise.all([
        hashToken(dto.accessToken),
        hashToken(dto.refreshToken),
      ]);

      // Use conservative expiry times
      const accessExpiry = Date.now() + 15 * 60 * 1000; // 15 min (access token TTL)
      const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days (refresh token TTL)

      const [r1, r2] = await Promise.all([
        tokenBlacklist.add(accessHash, accessExpiry),
        tokenBlacklist.add(refreshHash, refreshExpiry),
      ]);

      if (!r1.ok) return r1;
      if (!r2.ok) return r2;

      logger.info("User logged out successfully");
      return ok(undefined);
    },
  };
};
