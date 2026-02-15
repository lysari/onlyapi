/**
 * Circuit breaker port — resilience pattern for external service calls.
 *
 * States:
 *   CLOSED   → normal operation; failures counted
 *   OPEN     → requests short-circuited; waiting for reset timeout
 *   HALF_OPEN → limited probes allowed to test recovery
 */

export const CircuitState = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

export interface CircuitBreakerOptions {
  /** Name for identification and metrics */
  readonly name: string;
  /** Number of failures before opening (default: 5) */
  readonly failureThreshold: number;
  /** Time in ms before OPEN → HALF_OPEN (default: 30_000) */
  readonly resetTimeoutMs: number;
  /** Number of successful probes in HALF_OPEN before closing (default: 2) */
  readonly halfOpenSuccessThreshold: number;
  /** Called on state change */
  readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreaker {
  /** Execute a function through the circuit breaker */
  execute<T>(fn: () => Promise<T>): Promise<T>;
  /** Get current state */
  readonly state: CircuitState;
  /** Get name */
  readonly name: string;
  /** Get failure count in current window */
  readonly failureCount: number;
  /** Reset to CLOSED state */
  reset(): void;
}
