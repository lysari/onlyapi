/**
 * Circuit breaker implementation — resilience pattern for external calls.
 *
 * State machine:
 *   CLOSED   → (failures ≥ threshold)  → OPEN
 *   OPEN     → (timeout elapsed)      → HALF_OPEN
 *   HALF_OPEN → (successes ≥ threshold) → CLOSED
 *   HALF_OPEN → (any failure)           → OPEN
 */

import {
  type CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitState,
} from "../../core/ports/circuit-breaker.js";

export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;

  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — request short-circuited`);
    this.circuitName = name;
    this.name = "CircuitBreakerOpenError";
  }
}

export const createCircuitBreaker = (options: CircuitBreakerOptions): CircuitBreaker => {
  const { name, failureThreshold, resetTimeoutMs, halfOpenSuccessThreshold, onStateChange } =
    options;

  let state: CircuitState = CircuitState.CLOSED;
  let failures = 0;
  let successes = 0;
  let lastFailureTime = 0;
  let halfOpenInFlight = 0;

  const transition = (to: CircuitState): void => {
    if (state === to) return;
    const from = state;
    state = to;
    onStateChange?.(name, from, to);
  };

  const recordSuccess = (): void => {
    if (state === CircuitState.HALF_OPEN) {
      successes++;
      halfOpenInFlight--;
      if (successes >= halfOpenSuccessThreshold) {
        failures = 0;
        successes = 0;
        transition(CircuitState.CLOSED);
      }
    } else {
      failures = 0;
    }
  };

  const recordFailure = (): void => {
    failures++;
    lastFailureTime = Date.now();

    if (state === CircuitState.HALF_OPEN) {
      halfOpenInFlight--;
      successes = 0;
      transition(CircuitState.OPEN);
    } else if (failures >= failureThreshold) {
      transition(CircuitState.OPEN);
    }
  };

  return {
    get state() {
      // Check if it's time to transition OPEN → HALF_OPEN
      if (state === CircuitState.OPEN) {
        const elapsed = Date.now() - lastFailureTime;
        if (elapsed >= resetTimeoutMs) {
          successes = 0;
          halfOpenInFlight = 0;
          transition(CircuitState.HALF_OPEN);
        }
      }
      return state;
    },

    get name() {
      return name;
    },

    get failureCount() {
      return failures;
    },

    reset(): void {
      failures = 0;
      successes = 0;
      halfOpenInFlight = 0;
      transition(CircuitState.CLOSED);
    },

    async execute<T>(fn: () => Promise<T>): Promise<T> {
      // Re-check state (may transition OPEN → HALF_OPEN)
      if (state === CircuitState.OPEN) {
        const elapsed = Date.now() - lastFailureTime;
        if (elapsed >= resetTimeoutMs) {
          successes = 0;
          halfOpenInFlight = 0;
          transition(CircuitState.HALF_OPEN);
        }
      }

      if (state === CircuitState.OPEN) {
        throw new CircuitBreakerOpenError(name);
      }

      // In HALF_OPEN, limit concurrent probes
      if (state === CircuitState.HALF_OPEN) {
        if (halfOpenInFlight >= halfOpenSuccessThreshold) {
          throw new CircuitBreakerOpenError(name);
        }
        halfOpenInFlight++;
      }

      try {
        const result = await fn();
        recordSuccess();
        return result;
      } catch (error: unknown) {
        recordFailure();
        throw error;
      }
    },
  };
};
