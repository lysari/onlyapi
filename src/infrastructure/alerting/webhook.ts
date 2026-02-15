/**
 * Webhook alert sink — sends alert notifications to configured webhook URLs.
 *
 * Features:
 *   - HTTP POST with JSON payload
 *   - Retry with backoff on transient failures
 *   - Configurable via ALERT_WEBHOOK_URL env var
 *   - Non-blocking — fire-and-forget with error logging
 */

import type { AlertPayload, AlertSink } from "../../core/ports/alert-sink.js";
import type { Logger } from "../../core/ports/logger.js";

interface WebhookAlertSinkOptions {
  /** Webhook URL to POST alerts to */
  readonly url: string;
  /** Request timeout in ms (default: 5000) */
  readonly timeoutMs?: number;
  /** Max retry attempts (default: 2) */
  readonly maxRetries?: number;
  /** Logger for error reporting */
  readonly logger: Logger;
}

export const createWebhookAlertSink = (options: WebhookAlertSinkOptions): AlertSink => {
  const { url, logger } = options;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxRetries = options.maxRetries ?? 2;

  return {
    get enabled(): boolean {
      return url.length > 0;
    },

    async send(payload: AlertPayload): Promise<void> {
      const body = JSON.stringify(payload);
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "onlyApi/1.3.0",
            },
            body,
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (response.ok) {
            logger.debug("Alert sent successfully", {
              level: payload.level,
              title: payload.title,
              attempt: attempt + 1,
            });
            return;
          }

          lastError = new Error(`Webhook returned ${response.status}`);
          logger.warn("Alert webhook returned non-OK status", {
            status: response.status,
            attempt: attempt + 1,
          });
        } catch (error: unknown) {
          lastError = error;
          if (attempt < maxRetries) {
            // Exponential backoff: 500ms, 1000ms
            const delay = 500 * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      logger.error("Failed to send alert after retries", {
        level: payload.level,
        title: payload.title,
        error: lastError instanceof Error ? lastError.message : String(lastError),
        maxRetries,
      });
    },
  };
};

/**
 * No-op alert sink for when no webhook URL is configured.
 */
export const createNoopAlertSink = (): AlertSink => ({
  get enabled(): boolean {
    return false;
  },
  async send(_payload: AlertPayload): Promise<void> {
    // intentionally empty — no webhook configured
  },
});
