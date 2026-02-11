/**
 * Generate a cryptographically random request identifier (UUIDv4).
 * Uses Bun's built-in crypto — zero deps.
 */
export const generateId = (): string => crypto.randomUUID();
