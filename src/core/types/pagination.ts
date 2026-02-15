/**
 * Cursor-based pagination types.
 * Cursor is an opaque base64-encoded string containing the sort key.
 */

export interface CursorParams {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly total?: number | undefined;
}

/** Encode a cursor value (ISO timestamp or ID) to a URL-safe opaque string */
export const encodeCursor = (value: string): string => btoa(value);

/** Decode an opaque cursor back to the original value */
export const decodeCursor = (cursor: string): string | null => {
  try {
    return atob(cursor);
  } catch {
    return null;
  }
};
