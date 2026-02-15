/**
 * Minimal compile-time–safe DI container.
 * No decorators, no reflect-metadata, no runtime magic.
 * Register singletons by token; resolve by token.
 */

const registry = new Map<symbol, unknown>();

export const Container = {
  register<T>(token: symbol, instance: T): void {
    if (registry.has(token)) {
      throw new Error(`[Container] Token already registered: ${token.toString()}`);
    }
    registry.set(token, instance);
  },

  resolve<T>(token: symbol): T {
    const instance = registry.get(token);
    if (instance === undefined) {
      throw new Error(`[Container] Token not registered: ${token.toString()}`);
    }
    return instance as T;
  },

  /** Only for tests — clears the entire registry */
  reset(): void {
    registry.clear();
  },
} as const;

/** Well-known DI tokens */
export const Tokens = {
  Logger: Symbol.for("Logger"),
  Config: Symbol.for("Config"),
  UserRepository: Symbol.for("UserRepository"),
  PasswordHasher: Symbol.for("PasswordHasher"),
  TokenService: Symbol.for("TokenService"),
  TokenBlacklist: Symbol.for("TokenBlacklist"),
  AccountLockout: Symbol.for("AccountLockout"),
  AuthService: Symbol.for("AuthService"),
  UserService: Symbol.for("UserService"),
  HealthService: Symbol.for("HealthService"),
  AdminService: Symbol.for("AdminService"),
  AuditLog: Symbol.for("AuditLog"),
  Database: Symbol.for("Database"),
  MetricsCollector: Symbol.for("MetricsCollector"),
  AlertSink: Symbol.for("AlertSink"),
  VerificationTokenRepository: Symbol.for("VerificationTokenRepository"),
  RefreshTokenStore: Symbol.for("RefreshTokenStore"),
  ApiKeyRepository: Symbol.for("ApiKeyRepository"),
  PasswordHistory: Symbol.for("PasswordHistory"),
  PasswordPolicy: Symbol.for("PasswordPolicy"),
  TotpService: Symbol.for("TotpService"),
  OAuthProviders: Symbol.for("OAuthProviders"),
  OAuthAccountRepository: Symbol.for("OAuthAccountRepository"),
  ApiKeyService: Symbol.for("ApiKeyService"),
  EventBus: Symbol.for("EventBus"),
  EventFactory: Symbol.for("EventFactory"),
  WebhookRegistry: Symbol.for("WebhookRegistry"),
  WebhookDispatcher: Symbol.for("WebhookDispatcher"),
  JobQueue: Symbol.for("JobQueue"),
  WebSocketManager: Symbol.for("WebSocketManager"),
  SseHandler: Symbol.for("SseHandler"),
} as const;
