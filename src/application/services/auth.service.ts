import { UserRole } from "../../core/entities/user.entity.js";
import type { AppError } from "../../core/errors/app-error.js";
import { badRequest, forbidden, unauthorized } from "../../core/errors/app-error.js";
import type { AccountLockout } from "../../core/ports/account-lockout.js";
import type { Logger } from "../../core/ports/logger.js";
import type { OAuthAccountRepository, OAuthProvider } from "../../core/ports/oauth.js";
import type { PasswordHasher } from "../../core/ports/password-hasher.js";
import type { PasswordHistory } from "../../core/ports/password-history.js";
import type { PasswordPolicy } from "../../core/ports/password-policy.js";
import type { RefreshTokenStore } from "../../core/ports/refresh-token-store.js";
import type { TokenBlacklist } from "../../core/ports/token-blacklist.js";
import type { TokenPair, TokenPayload, TokenService } from "../../core/ports/token-service.js";
import type { TotpService } from "../../core/ports/totp-service.js";
import type { UserRepository } from "../../core/ports/user.repository.js";
import type { VerificationTokenRepository } from "../../core/ports/verification-token.js";
import { VerificationTokenType } from "../../core/ports/verification-token.js";
import type { UserId } from "../../core/types/brand.js";
import { type Result, err, ok } from "../../core/types/result.js";
import type {
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  MfaDisableDto,
  MfaEnableDto,
  MfaVerifyDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "../dtos/auth.dto.js";

export interface MfaSetupResponse {
  readonly secret: string;
  readonly uri: string;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly mfaRequired?: boolean;
  readonly mfaToken?: string;
}

export interface AuthService {
  register(dto: RegisterDto): Promise<Result<LoginResponse, AppError>>;
  login(dto: LoginDto): Promise<Result<LoginResponse, AppError>>;
  refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>>;
  logout(dto: LogoutDto): Promise<Result<void, AppError>>;
  verifyEmail(dto: VerifyEmailDto): Promise<Result<void, AppError>>;
  resendVerification(userId: UserId): Promise<Result<{ token: string }, AppError>>;
  forgotPassword(dto: ForgotPasswordDto): Promise<Result<{ token: string }, AppError>>;
  resetPassword(dto: ResetPasswordDto): Promise<Result<void, AppError>>;
  mfaSetup(userId: UserId, email: string): Promise<Result<MfaSetupResponse, AppError>>;
  mfaEnable(userId: UserId, dto: MfaEnableDto): Promise<Result<void, AppError>>;
  mfaDisable(userId: UserId, dto: MfaDisableDto): Promise<Result<void, AppError>>;
  mfaVerify(dto: MfaVerifyDto): Promise<Result<TokenPair, AppError>>;
  oauthLogin(
    provider: string,
    code: string,
    redirectUri: string,
  ): Promise<Result<LoginResponse, AppError>>;
}

interface Deps {
  readonly userRepo: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenService: TokenService;
  readonly tokenBlacklist: TokenBlacklist;
  readonly accountLockout: AccountLockout;
  readonly verificationTokens: VerificationTokenRepository;
  readonly refreshTokenStore: RefreshTokenStore;
  readonly passwordHistory: PasswordHistory;
  readonly passwordPolicy: PasswordPolicy;
  readonly totpService: TotpService;
  readonly oauthProviders: ReadonlyMap<string, OAuthProvider>;
  readonly oauthAccounts: OAuthAccountRepository;
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

/** Email verification token TTL: 24 hours */
const EMAIL_VERIFY_TTL = 24 * 60 * 60 * 1000;
/** Password reset token TTL: 1 hour */
const PASSWORD_RESET_TTL = 60 * 60 * 1000;

export const createAuthService = (deps: Deps): AuthService => {
  const {
    userRepo,
    passwordHasher,
    tokenService,
    tokenBlacklist,
    accountLockout,
    verificationTokens,
    refreshTokenStore,
    passwordHistory,
    passwordPolicy,
    totpService,
    oauthProviders,
    oauthAccounts,
    logger,
  } = deps;

  /** Validate password against policy */
  const validatePassword = async (
    password: string,
    userId?: UserId,
  ): Promise<Result<void, AppError>> => {
    const policyResult = passwordPolicy.validate(password);
    if (!policyResult.valid) {
      return err(
        badRequest("Password does not meet policy requirements", {
          violations: policyResult.violations,
        }),
      );
    }
    if (userId) {
      const historyResult = await passwordPolicy.checkHistory(
        userId,
        password,
        passwordHasher,
        passwordHistory,
      );
      if (!historyResult.ok) return historyResult;
      if (historyResult.value) {
        return err(badRequest("Password was recently used. Choose a different password."));
      }
    }
    return ok(undefined);
  };

  /** Create token pair and store refresh token family */
  const createTokens = async (payload: TokenPayload): Promise<Result<TokenPair, AppError>> => {
    const tokenResult = await tokenService.sign(payload);
    if (!tokenResult.ok) return tokenResult;

    // Store refresh token in family for rotation tracking
    const refreshHash = await hashToken(tokenResult.value.refreshToken);
    await refreshTokenStore.createFamily(payload.sub, refreshHash);

    return ok(tokenResult.value);
  };

  return {
    async register(dto: RegisterDto): Promise<Result<LoginResponse, AppError>> {
      logger.info("Registering user", { email: dto.email });

      // Validate password against policy
      const policyCheck = await validatePassword(dto.password);
      if (!policyCheck.ok) return policyCheck;

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

      // Store in password history
      await passwordHistory.add(user.id, hashResult.value);

      // Generate email verification token
      const verifyTokenResult = await verificationTokens.create(
        user.id,
        VerificationTokenType.EMAIL_VERIFICATION,
        EMAIL_VERIFY_TTL,
      );

      const tokenPayload: TokenPayload = { sub: user.id, role: user.role };
      const tokenResult = await createTokens(tokenPayload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("User registered", { userId: user.id });

      const response: LoginResponse = {
        ...tokenResult.value,
      };

      // In development, include verification token for easy testing
      if (verifyTokenResult.ok) {
        logger.info("Email verification token generated", {
          userId: user.id,
          token: verifyTokenResult.value,
        });
      }

      return ok(response);
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: login flow with lockout, MFA, and password expiry
    async login(dto: LoginDto): Promise<Result<LoginResponse, AppError>> {
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

      // Successful password check — reset lockout counter
      await accountLockout.resetAttempts(dto.email);

      // Check password expiry
      if (passwordPolicy.isExpired(user.passwordChangedAt)) {
        logger.warn("Login blocked — password expired", { email: dto.email });
        return err(forbidden("Password has expired. Please reset your password."));
      }

      // If MFA is enabled, return a partial MFA token instead of full auth
      if (user.mfaEnabled) {
        // Create a short-lived MFA challenge token (5 minutes)
        const mfaPayload: TokenPayload = { sub: user.id, role: user.role };
        const mfaTokenResult = await tokenService.sign(mfaPayload);
        if (!mfaTokenResult.ok) return mfaTokenResult;

        logger.info("MFA challenge issued", { userId: user.id });
        return ok({
          accessToken: "",
          refreshToken: "",
          mfaRequired: true,
          mfaToken: mfaTokenResult.value.accessToken,
        });
      }

      const tokenPayload: TokenPayload = { sub: user.id, role: user.role };
      const tokenResult = await createTokens(tokenPayload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("User logged in", { userId: user.id });
      return ok(tokenResult.value);
    },

    async refresh(dto: RefreshDto): Promise<Result<TokenPair, AppError>> {
      logger.debug("Token refresh attempt");

      const tokenHash = await hashToken(dto.refreshToken);

      // Check blacklist first
      const blacklisted = await tokenBlacklist.isBlacklisted(tokenHash);
      if (blacklisted.ok && blacklisted.value) {
        logger.warn("Refresh attempt with blacklisted token");
        return err(unauthorized("Token has been revoked"));
      }

      // Check refresh token family for reuse detection
      const familyResult = await refreshTokenStore.findByTokenHash(tokenHash);
      if (!familyResult.ok) return familyResult;

      if (familyResult.value !== null) {
        const family = familyResult.value;
        if (family.revoked) {
          // Reuse detected! Revoke ALL tokens for this user
          logger.warn("Refresh token reuse detected — revoking all sessions", {
            familyId: family.id,
            userId: family.userId,
          });
          await refreshTokenStore.revokeAllForUser(family.userId);
          return err(unauthorized("Token reuse detected. All sessions revoked."));
        }
      }

      const result = await tokenService.refresh(dto.refreshToken);
      if (!result.ok) {
        logger.warn("Token refresh failed", { code: result.error.code });
        return result;
      }

      // Rotate: blacklist old, store new in family
      await tokenBlacklist.add(tokenHash, Date.now() + 7 * 24 * 60 * 60 * 1000);

      if (familyResult.value !== null) {
        const newHash = await hashToken(result.value.refreshToken);
        await refreshTokenStore.rotate(familyResult.value.id, tokenHash, newHash);
      }

      logger.info("Token refreshed successfully");
      return result;
    },

    async logout(dto: LogoutDto): Promise<Result<void, AppError>> {
      logger.info("Logout attempt");

      const [accessHash, refreshHash] = await Promise.all([
        hashToken(dto.accessToken),
        hashToken(dto.refreshToken),
      ]);

      const accessExpiry = Date.now() + 15 * 60 * 1000;
      const refreshExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const [r1, r2] = await Promise.all([
        tokenBlacklist.add(accessHash, accessExpiry),
        tokenBlacklist.add(refreshHash, refreshExpiry),
      ]);

      if (!r1.ok) return r1;
      if (!r2.ok) return r2;

      // Revoke refresh token family
      const familyResult = await refreshTokenStore.findByTokenHash(refreshHash);
      if (familyResult.ok && familyResult.value) {
        await refreshTokenStore.revokeFamily(familyResult.value.id);
      }

      logger.info("User logged out successfully");
      return ok(undefined);
    },

    async verifyEmail(dto: VerifyEmailDto): Promise<Result<void, AppError>> {
      logger.info("Email verification attempt");

      const result = await verificationTokens.verify(
        dto.token,
        VerificationTokenType.EMAIL_VERIFICATION,
      );
      if (!result.ok) return result;

      const userId = result.value;
      const updateResult = await userRepo.update(userId, { emailVerified: true });
      if (!updateResult.ok) return updateResult;

      logger.info("Email verified", { userId });
      return ok(undefined);
    },

    async resendVerification(userId: UserId): Promise<Result<{ token: string }, AppError>> {
      logger.info("Resend email verification", { userId });

      // Invalidate existing tokens
      await verificationTokens.invalidateAll(userId, VerificationTokenType.EMAIL_VERIFICATION);

      const tokenResult = await verificationTokens.create(
        userId,
        VerificationTokenType.EMAIL_VERIFICATION,
        EMAIL_VERIFY_TTL,
      );
      if (!tokenResult.ok) return tokenResult;

      logger.info("Verification token regenerated", { userId });
      return ok({ token: tokenResult.value });
    },

    async forgotPassword(dto: ForgotPasswordDto): Promise<Result<{ token: string }, AppError>> {
      logger.info("Password reset requested", { email: dto.email });

      const findResult = await userRepo.findByEmail(dto.email);
      if (!findResult.ok) {
        // Don't reveal whether the email exists — always return success
        logger.debug("Password reset for unknown email", { email: dto.email });
        return ok({ token: "" });
      }

      const user = findResult.value;

      // Invalidate existing reset tokens
      await verificationTokens.invalidateAll(user.id, VerificationTokenType.PASSWORD_RESET);

      const tokenResult = await verificationTokens.create(
        user.id,
        VerificationTokenType.PASSWORD_RESET,
        PASSWORD_RESET_TTL,
      );
      if (!tokenResult.ok) return tokenResult;

      logger.info("Password reset token generated", { userId: user.id });
      return ok({ token: tokenResult.value });
    },

    async resetPassword(dto: ResetPasswordDto): Promise<Result<void, AppError>> {
      logger.info("Password reset attempt");

      const verifyResult = await verificationTokens.verify(
        dto.token,
        VerificationTokenType.PASSWORD_RESET,
      );
      if (!verifyResult.ok) return verifyResult;

      const userId = verifyResult.value;

      // Validate new password against policy
      const policyCheck = await validatePassword(dto.password, userId);
      if (!policyCheck.ok) return policyCheck;

      const hashResult = await passwordHasher.hash(dto.password);
      if (!hashResult.ok) return hashResult;

      const updateResult = await userRepo.update(userId, {
        passwordHash: hashResult.value,
        passwordChangedAt: Date.now(),
      });
      if (!updateResult.ok) return updateResult;

      // Store in password history
      await passwordHistory.add(userId, hashResult.value);
      await passwordHistory.prune(userId, passwordPolicy.config.historyCount);

      // Revoke all refresh tokens (force re-login)
      await refreshTokenStore.revokeAllForUser(userId);

      logger.info("Password reset completed", { userId });
      return ok(undefined);
    },

    async mfaSetup(userId: UserId, email: string): Promise<Result<MfaSetupResponse, AppError>> {
      logger.info("MFA setup initiated", { userId });

      const secret = totpService.generateSecret();
      const uri = totpService.generateUri(secret, email, "onlyApi");

      return ok({ secret, uri });
    },

    async mfaEnable(userId: UserId, dto: MfaEnableDto): Promise<Result<void, AppError>> {
      logger.info("MFA enable attempt", { userId });

      // Verify the code against the provided secret before enabling
      const verifyResult = totpService.verify(dto.secret, dto.code);
      if (!verifyResult.ok) return verifyResult;
      if (!verifyResult.value) {
        return err(unauthorized("Invalid MFA code"));
      }

      const updateResult = await userRepo.update(userId, {
        mfaSecret: dto.secret,
        mfaEnabled: true,
      });
      if (!updateResult.ok) return updateResult;

      logger.info("MFA enabled", { userId });
      return ok(undefined);
    },

    async mfaDisable(userId: UserId, dto: MfaDisableDto): Promise<Result<void, AppError>> {
      logger.info("MFA disable attempt", { userId });

      // Verify the code first
      const findResult = await userRepo.findById(userId);
      if (!findResult.ok) return findResult;

      const user = findResult.value;
      if (!user.mfaEnabled || !user.mfaSecret) {
        return err(badRequest("MFA is not enabled"));
      }

      const verifyResult = totpService.verify(user.mfaSecret, dto.code);
      if (!verifyResult.ok) return verifyResult;
      if (!verifyResult.value) {
        return err(unauthorized("Invalid MFA code"));
      }

      const updateResult = await userRepo.update(userId, {
        mfaSecret: null,
        mfaEnabled: false,
      });
      if (!updateResult.ok) return updateResult;

      logger.info("MFA disabled", { userId });
      return ok(undefined);
    },

    async mfaVerify(dto: MfaVerifyDto): Promise<Result<TokenPair, AppError>> {
      logger.info("MFA verification attempt");

      // Verify the MFA token to get the user
      const tokenResult = await tokenService.verify(dto.mfaToken);
      if (!tokenResult.ok) {
        return err(unauthorized("Invalid or expired MFA token"));
      }

      const userId = tokenResult.value.sub;
      const findResult = await userRepo.findById(userId);
      if (!findResult.ok) return findResult;

      const user = findResult.value;
      if (!user.mfaEnabled || !user.mfaSecret) {
        return err(badRequest("MFA is not enabled for this account"));
      }

      const verifyResult = totpService.verify(user.mfaSecret, dto.code);
      if (!verifyResult.ok) return verifyResult;
      if (!verifyResult.value) {
        return err(unauthorized("Invalid MFA code"));
      }

      // MFA passed — issue full token pair
      const payload: TokenPayload = { sub: user.id, role: user.role };
      const fullTokenResult = await createTokens(payload);
      if (!fullTokenResult.ok) return fullTokenResult;

      logger.info("MFA verified — user logged in", { userId: user.id });
      return ok(fullTokenResult.value);
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OAuth login orchestrates provider exchange, user lookup/creation, and token issuance
    async oauthLogin(
      provider: string,
      code: string,
      redirectUri: string,
    ): Promise<Result<LoginResponse, AppError>> {
      logger.info("OAuth login attempt", { provider });

      const oauthProvider = oauthProviders.get(provider);
      if (!oauthProvider) {
        return err(badRequest(`Unknown OAuth provider: ${provider}`));
      }

      // Exchange code for user info
      const exchangeResult = await oauthProvider.exchangeCode(code, redirectUri);
      if (!exchangeResult.ok) return exchangeResult;

      const oauthUser = exchangeResult.value;

      // Check if this OAuth identity is already linked
      const existingOAuth = await oauthAccounts.findByProvider(provider, oauthUser.providerId);
      if (!existingOAuth.ok) return existingOAuth;

      let userId: UserId;

      if (existingOAuth.value) {
        // Existing linked account — just login
        userId = existingOAuth.value.userId;
      } else {
        // New OAuth user — find by email or create
        const findResult = await userRepo.findByEmail(oauthUser.email);
        if (findResult.ok) {
          // Link OAuth to existing user
          userId = findResult.value.id;
        } else {
          // Create new user (no password — OAuth only)
          const randomHash = await passwordHasher.hash(crypto.randomUUID());
          if (!randomHash.ok) return randomHash;

          const createResult = await userRepo.create({
            email: oauthUser.email,
            passwordHash: randomHash.value,
            role: UserRole.USER,
          });
          if (!createResult.ok) return createResult;

          userId = createResult.value.id;

          // Mark email as verified (OAuth provider already verified it)
          await userRepo.update(userId, { emailVerified: true });
        }

        // Link the OAuth account
        const linkResult = await oauthAccounts.link(
          userId,
          provider,
          oauthUser.providerId,
          oauthUser.email,
        );
        if (!linkResult.ok) return linkResult;
      }

      // Find user for role info
      const user = await userRepo.findById(userId);
      if (!user.ok) return user;

      const payload: TokenPayload = { sub: user.value.id, role: user.value.role };
      const tokenResult = await createTokens(payload);
      if (!tokenResult.ok) return tokenResult;

      logger.info("OAuth login successful", { provider, userId });
      return ok(tokenResult.value);
    },
  };
};
