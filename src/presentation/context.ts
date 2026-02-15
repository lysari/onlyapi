import type { Logger } from "../core/ports/logger.js";
import type { TokenPayload } from "../core/ports/token-service.js";
import type { RequestId } from "../core/types/brand.js";

/**
 * Typed request context threaded through the middleware pipeline.
 * Immutable — each middleware returns a new context with added fields.
 */
export interface RequestContext {
  readonly requestId: RequestId;
  readonly startTime: number;
  readonly ip: string;
  readonly method: string;
  readonly path: string;
  readonly auth?: TokenPayload | undefined;
  /** Request-scoped logger with requestId pre-bound */
  readonly logger: Logger;
}
