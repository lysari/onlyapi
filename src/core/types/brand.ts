/**
 * Branded / Opaque type utility.
 * Prevents accidental interchange of structurally identical primitives.
 *
 * @example
 * type UserId = Brand<string, "UserId">;
 * const id: UserId = "abc" as UserId;
 */
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Common branded identifiers */
export type UserId = Brand<string, "UserId">;
export type RequestId = Brand<string, "RequestId">;
export type Timestamp = Brand<number, "Timestamp">;

/** Helper to create branded values (runtime no-op, compile-time safety) */
export const brand = <T, B extends string>(value: T): Brand<T, B> => value as Brand<T, B>;
