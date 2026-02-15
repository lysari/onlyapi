/**
 * Background job queue port — async task processing with retry.
 *
 * Jobs are submitted and executed asynchronously. Failed jobs are retried
 * with exponential backoff up to maxRetries.
 */

import type { AppError } from "../errors/app-error.js";
import type { Result } from "../types/result.js";

export const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  DEAD: "dead",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export interface Job {
  readonly id: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxRetries: number;
  /** ISO 8601 — when the job should next be attempted */
  readonly runAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Last error message (if failed) */
  readonly lastError?: string | undefined;
}

export type JobHandler = (payload: Readonly<Record<string, unknown>>) => Promise<void>;

export interface SubmitJobOptions {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Max retry attempts (default: 3) */
  readonly maxRetries?: number | undefined;
  /** Delay before first run in ms (default: 0 = immediate) */
  readonly delayMs?: number | undefined;
}

export interface JobQueue {
  /** Submit a job for async processing */
  submit(options: SubmitJobOptions): Result<Job, AppError>;

  /** Register a handler for a job type */
  registerHandler(type: string, handler: JobHandler): void;

  /** Start processing jobs (called once at boot) */
  start(): void;

  /** Stop processing (graceful shutdown) */
  stop(): void;

  /** Get job by ID */
  getJob(id: string): Result<Job | null, AppError>;

  /** Get queue statistics */
  stats(): Result<JobQueueStats, AppError>;
}

export interface JobQueueStats {
  readonly pending: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  readonly dead: number;
}
