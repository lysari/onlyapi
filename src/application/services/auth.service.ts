import type { UserRepository } from "../../core/ports/user.repository.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import type { TokenService, TokenPair, TokenPayload } from "../../core/ports/token-service.js";
import type { Logger } from "../../core/ports/logger.js";
import type { AppError } from "../../core/errors/app-error.js";
import { ok, err, type Result } from "../../core/types/result.js";
import { unauthorized } from "../../core/errors/app-error.js";
import { UserRole } from "../../core/entities/user.entity.js";
import type { RegisterDto, LoginDto, RefreshDto } from "../dtos/auth.dto.js";

export interface AuthService {
  register(dto: RegisterDto): Promise<Result<TokenPair, AppError>>;
  login(dto: LoginDto): Promise<Result<TokenPair, AppError>>;
  refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>>;
}

interface Deps {
  readonly userRepo: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenService: TokenService;
  readonly logger: Logger;
}

export const createAuthService = (deps: Deps): AuthService => {
  const { userRepo, passwordHasher, tokenService, logger } = deps;

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

      const findResult = await userRepo.findByEmail(dto.email);
      if (!findResult.ok) {
        logger.warn("Login failed — user not found", { email: dto.email });
        return err(unauthorized("Invalid credentials"));
      }

      const user = findResult.value;
      const verifyResult = await passwordHasher.verify(dto.password, user.passwordHash);
      if (!verifyResult.ok) return verifyResult;
      if (!verifyResult.value) {
        logger.warn("Login failed — invalid password", { email: dto.email });
        return err(unauthorized("Invalid credentials"));
      }

      const tokenPayload: TokenPayload = { sub: user.id, role: user.role };
      const tokenResult = await tokenService.sign(tokenPayload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("User logged in", { userId: user.id });
      return ok(tokenResult.value);
    },

    async refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>> {
      logger.debug("Token refresh attempt");

      const result = await tokenService.refresh(dto.refreshToken);
      if (!result.ok) {
        logger.warn("Token refresh failed", { code: result.error.code });
        return result;
      }

      logger.info("Token refreshed successfully");
      return result;
    },
  };
};
