import type { config } from './config.js';
import { log } from './logger.js';
import { parseTaskBrief } from './parse-brief.js';
import { SokosumiClient } from './sokosumi-client.js';
import type { WorkerState } from './state.js';
import { markInFlight, markProcessed } from './state.js';

type TaskSummary = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
};

type TaskListResponse = TaskSummary[];

type InputSchemaPayload = {
  input_data?: unknown[];
  input_groups?: unknown;
};

type JobSummary = {
  id: string;
  status: string;
  result?: string | null;
};

const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'failed',
  'payment_failed',
  'refund_resolved',
  'dispute_resolved',
]);

export class TaskProcessor {
  private inputSchemaCache: InputSchemaPayload | null = null;

  constructor(
    private readonly client: SokosumiClient,
    private readonly cfg: typeof config,
  ) {}

  async pollReadyTasks(): Promise<TaskSummary[]> {
    return this.client.get<TaskListResponse>('/v1/tasks', {
      status: 'READY',
      limit: '20',
    });
  }

  async processTask(taskId: string, state: WorkerState): Promise<void> {
    markInFlight(state, taskId);
    log('Processing task', { taskId });

    try {
      const task = await this.client.get<TaskSummary>(`/v1/tasks/${taskId}`);
      if (task.status !== 'READY') {
        log('Task no longer READY; skipping', { taskId, status: task.status });
        markProcessed(state, taskId);
        return;
      }

      const input = parseTaskBrief(
        task.name,
        task.description,
        this.cfg.defaultArticleLimit,
      );

      await this.postTaskEvent(taskId, {
        status: 'RUNNING',
        comment: `News search started for query: ${input.query}`,
      });

      const inputSchema = await this.loadInputSchema();
      const job = await this.client.post<JobSummary>(`/v1/tasks/${taskId}/jobs`, {
        agentId: this.cfg.newsAgentId,
        inputSchema,
        inputData: input,
        maxCredits: this.cfg.maxCredits,
        name: task.name,
      });

      log('Job created', { taskId, jobId: job.id });

      const finished = await this.waitForJob(job.id);
      if (finished.status === 'completed') {
        const snippet = truncate(finished.result ?? '(no result body)', 12_000);
        await this.postTaskEvent(taskId, {
          status: 'COMPLETED',
          comment: snippet,
        });
        log('Task completed', { taskId, jobId: job.id });
      } else {
        await this.postTaskEvent(taskId, {
          status: 'FAILED',
          comment: `News job ended with status ${finished.status}`,
        });
        log('Task failed', { taskId, jobId: job.id, status: finished.status });
      }

      markProcessed(state, taskId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown worker error';
      log('Task processing error', { taskId, message });
      try {
        await this.postTaskEvent(taskId, {
          status: 'FAILED',
          comment: `Coworker worker error: ${message}`,
        });
      } catch (eventError) {
        log('Could not post FAILED event', {
          taskId,
          message:
            eventError instanceof Error
              ? eventError.message
              : String(eventError),
        });
      }
      markProcessed(state, taskId);
    }
  }

  private async loadInputSchema(): Promise<InputSchemaPayload> {
    if (this.inputSchemaCache) {
      return this.inputSchemaCache;
    }
    const schema = await this.client.get<InputSchemaPayload>(
      `/v1/agents/${this.cfg.newsAgentId}/input-schema`,
    );
    this.inputSchemaCache = schema;
    return schema;
  }

  private async postTaskEvent(
    taskId: string,
    body: { status: string; comment: string },
  ): Promise<void> {
    await this.client.post(`/v1/tasks/${taskId}/events`, body);
  }

  private async waitForJob(jobId: string): Promise<JobSummary> {
    const deadline = Date.now() + this.cfg.jobTimeoutMs;
    while (Date.now() < deadline) {
      const job = await this.client.get<JobSummary>(`/v1/jobs/${jobId}`);
      if (TERMINAL_JOB_STATUSES.has(job.status)) {
        return job;
      }
      await sleep(this.cfg.jobPollIntervalMs);
    }
    throw new Error(`Timed out waiting for job ${jobId}`);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 20)}\n\n… (truncated)`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
