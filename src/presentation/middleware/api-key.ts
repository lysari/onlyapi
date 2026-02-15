import type { ApiKeyService } from "../../application/services/api-key.service.js";
import type { AppError } from "../../core/errors/app-error.js";
import { unauthorized } from "../../core/errors/app-error.js";
import type { ApiKey } from "../../core/ports/api-key.js";
import { type Result, err } from "../../core/types/result.js";

/**
 * Middleware: API Key Authentication via X-API-Key header.
 * Falls back to Bearer token auth if no API key is provided.
 */
export const authenticateApiKey = async (
  req: Request,
  apiKeyService: ApiKeyService,
): Promise<Result<ApiKey, AppError>> => {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return err(unauthorized("Missing X-API-Key header"));
  return apiKeyService.verify(apiKey);
};
