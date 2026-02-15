/**
 * Alert sink port — webhook/notification interface for critical events.
 */

export const AlertLevel = {
  WARNING: "warning",
  CRITICAL: "critical",
  RESOLVED: "resolved",
} as const;

export type AlertLevel = (typeof AlertLevel)[keyof typeof AlertLevel];

export interface AlertPayload {
  readonly level: AlertLevel;
  readonly title: string;
  readonly message: string;
  readonly timestamp: string;
  readonly source: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AlertSink {
  /** Send an alert notification */
  send(payload: AlertPayload): Promise<void>;
  /** Check if the alert sink is configured and available */
  readonly enabled: boolean;
}
