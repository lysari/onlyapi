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
  AuthService: Symbol.for("AuthService"),
  UserService: Symbol.for("UserService"),
  HealthService: Symbol.for("HealthService"),
} as const;
