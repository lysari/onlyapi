/**
 * In-memory background job queue with retry and exponential backoff.
 *
 * Uses a polling loop with configurable interval. For production,
 * swap with a Redis/SQLite-backed adapter.
 */

import type { AppError } from "../../core/errors/app-error.js";
import { internal } from "../../core/errors/app-error.js";
import {
  type Job,
  type JobHandler,
  type JobQueue,
  type JobQueueStats,
  JobStatus,
  type SubmitJobOptions,
} from "../../core/ports/job-queue.js";
import type { Logger } from "../../core/ports/logger.js";
import type { Result } from "../../core/types/result.js";
import { err, ok } from "../../core/types/result.js";
import { generateId } from "../../shared/utils/id.js";

interface JobQueueDeps {
  readonly logger: Logger;
  /** Polling interval in ms (default: 1000) */
  readonly pollIntervalMs?: number | undefined;
}

export const createInMemoryJobQueue = (deps: JobQueueDeps): JobQueue => {
  const { logger } = deps;
  const pollIntervalMs = deps.pollIntervalMs ?? 1_000;

  const jobs = new Map<string, Job>();
  const handlers = new Map<string, JobHandler>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const updateJob = (id: string, updates: Partial<Job>): void => {
    const job = jobs.get(id);
    if (job) {
      jobs.set(id, { ...job, ...updates, updatedAt: new Date().toISOString() } as Job);
    }
  };

  const processJob = async (job: Job): Promise<void> => {
    const handler = handlers.get(job.type);
    if (!handler) {
      logger.warn("No handler registered for job type", { type: job.type, jobId: job.id });
      updateJob(job.id, { status: JobStatus.DEAD, lastError: `No handler for type: ${job.type}` });
      return;
    }

    updateJob(job.id, { status: JobStatus.RUNNING, attempts: job.attempts + 1 });

    try {
      await handler(job.payload);
      updateJob(job.id, { status: JobStatus.COMPLETED });
      logger.debug("Job completed", { jobId: job.id, type: job.type });
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const newAttempts = job.attempts + 1;

      if (newAttempts >= job.maxRetries) {
        updateJob(job.id, { status: JobStatus.DEAD, lastError: errorMsg });
        logger.error("Job failed permanently", {
          jobId: job.id,
          type: job.type,
          attempts: newAttempts,
          error: errorMsg,
        });
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 60s
        const backoffMs = Math.min(1_000 * 2 ** newAttempts, 60_000);
        const runAt = new Date(Date.now() + backoffMs).toISOString();
        updateJob(job.id, {
          status: JobStatus.PENDING,
          lastError: errorMsg,
          runAt,
        });
        logger.warn("Job failed, retrying", {
          jobId: job.id,
          type: job.type,
          attempts: newAttempts,
          nextRunAt: runAt,
          error: errorMsg,
        });
      }
    }
  };

  const poll = (): void => {
    const now = new Date().toISOString();
    for (const job of jobs.values()) {
      if (job.status === JobStatus.PENDING && job.runAt <= now) {
        // Fire and forget — errors are handled inside processJob
        processJob(job);
      }
    }
  };

  return {
    submit(options: SubmitJobOptions): Result<Job, AppError> {
      try {
        const now = new Date();
        const runAt = options.delayMs
          ? new Date(now.getTime() + options.delayMs).toISOString()
          : now.toISOString();

        const job: Job = {
          id: generateId(),
          type: options.type,
          payload: options.payload,
          status: JobStatus.PENDING,
          attempts: 0,
          maxRetries: options.maxRetries ?? 3,
          runAt,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        jobs.set(job.id, job);
        logger.debug("Job submitted", { jobId: job.id, type: job.type, runAt });
        return ok(job);
      } catch (e: unknown) {
        return err(internal(e instanceof Error ? e.message : "Failed to submit job"));
      }
    },

    registerHandler(type: string, handler: JobHandler): void {
      handlers.set(type, handler);
      logger.debug("Job handler registered", { type });
    },

    start(): void {
      if (running) return;
      running = true;
      timer = setInterval(poll, pollIntervalMs);
      logger.info("Job queue started", { pollIntervalMs });
    },

    stop(): void {
      if (!running) return;
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info("Job queue stopped");
    },

    getJob(id: string): Result<Job | null, AppError> {
      return ok(jobs.get(id) ?? null);
    },

    stats(): Result<JobQueueStats, AppError> {
      let pending = 0;
      let jobRunning = 0;
      let completed = 0;
      let failed = 0;
      let dead = 0;

      for (const job of jobs.values()) {
        switch (job.status) {
          case JobStatus.PENDING:
            pending++;
            break;
          case JobStatus.RUNNING:
            jobRunning++;
            break;
          case JobStatus.COMPLETED:
            completed++;
            break;
          case JobStatus.FAILED:
            failed++;
            break;
          case JobStatus.DEAD:
            dead++;
            break;
        }
      }

      return ok({ pending, running: jobRunning, completed, failed, dead });
    },
  };
};
