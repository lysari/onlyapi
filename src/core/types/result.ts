/**
 * Result monad — eliminates throw-based control flow.
 * Every fallible operation returns Result<T, E> instead of throwing.
 */

export type Result<T, E = AppError> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Map over the success value */
export const map = <T, U, E>(result: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;

/** FlatMap / chain */
export const flatMap = <T, U, E>(result: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
  result.ok ? fn(result.value) : result;

/** Unwrap with a default */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

/** Wrap a throwing function into a Result */
export const tryCatch = <T>(fn: () => T): Result<T, unknown> => {
  try {
    return ok(fn());
  } catch (e: unknown) {
    return err(e);
  }
};

/** Wrap an async throwing function into a Result */
export const tryCatchAsync = async <T>(fn: () => Promise<T>): Promise<Result<T, unknown>> => {
  try {
    return ok(await fn());
  } catch (e: unknown) {
    return err(e);
  }
};

// Re-export the error type referenced above
import type { AppError } from "../errors/app-error.js";
