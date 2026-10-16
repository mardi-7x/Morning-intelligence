import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';

export type JobType =
  | 'newspaper_generation'
  | 'user_on_demand_read'
  | 'scheduled_daily_run'
  | 'podcast_audio_generation'
  | 'slide_deck_generation';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
  stage: string;
  stageIndex: number;
  totalStages: number;
  percent: number;
  details?: string;
  updatedAt: string;
}

export interface BackgroundJob {
  id: string;
  type: JobType;
  userId: string; // chatId or 'system'
  status: JobStatus;
  progress: JobProgress;
  payload?: any;
  result?: any;
  error?: string;
  retries: number;
  maxRetries: number;
  timeoutMs: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'background-jobs.json');

class JobQueueService extends EventEmitter {
  private jobs: Map<string, BackgroundJob> = new Map();
  private isProcessing = false;
  private maxConcurrency = 2;
  private activeWorkers = 0;
  private saveTimeout: NodeJS.Timeout | null = null;
  private handlers: Map<
    JobType,
    (job: BackgroundJob, updateProgress: (stage: string, stageIndex: number, totalStages: number, details?: string) => Promise<void>) => Promise<any>
  > = new Map();

  constructor() {
    super();
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(JOBS_FILE)) {
        const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
        const list: BackgroundJob[] = JSON.parse(raw);
        for (const job of list) {
          // Recover zombie jobs from prior crashes / instance restarts
          if (job.status === 'running' || job.status === 'queued') {
            job.status = 'failed';
            job.error = 'Instance shutdown or restarted while job was in flight (recovered)';
            job.completedAt = new Date().toISOString();
          }
          this.jobs.set(job.id, job);
        }
      }
    } catch (err: any) {
      console.warn('[JobQueue] Error initializing job persistence:', err?.message || err);
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.persistJobsSync();
    }, 1000);
  }

  public persistJobsSync() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const list = Array.from(this.jobs.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100); // Keep last 100 jobs durable
      const tmpFile = `${JOBS_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
      fs.renameSync(tmpFile, JOBS_FILE);
    } catch (err: any) {
      console.error('[JobQueue] Failed to persist jobs:', err?.message || err);
    }
  }

  /**
   * Register a task handler for a specific job type.
   */
  public registerHandler(
    type: JobType,
    handler: (
      job: BackgroundJob,
      updateProgress: (stage: string, stageIndex: number, totalStages: number, details?: string) => Promise<void>
    ) => Promise<any>
  ) {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueues a job with duplicate prevention per user + type.
   */
  public enqueueJob(
    type: JobType,
    userId: string,
    payload?: any,
    options?: { maxRetries?: number; timeoutMs?: number }
  ): { job: BackgroundJob; isExisting: boolean } {
    // 1. Duplicate-job prevention: Check if an active job already exists for this user and type
    for (const existing of this.jobs.values()) {
      if (
        existing.userId === userId &&
        existing.type === type &&
        (existing.status === 'queued' || existing.status === 'running')
      ) {
        console.log(`[JobQueue] Returning existing active job ${existing.id} for userId=${userId} (${type})`);
        return { job: existing, isExisting: true };
      }
    }

    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: BackgroundJob = {
      id,
      type,
      userId,
      status: 'queued',
      progress: {
        stage: 'queued',
        stageIndex: 0,
        totalStages: 5,
        percent: 0,
        details: 'Job queued for background processing',
        updatedAt: new Date().toISOString(),
      },
      payload,
      retries: 0,
      maxRetries: options?.maxRetries ?? 2,
      timeoutMs: options?.timeoutMs ?? 75000,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(id, job);
    this.scheduleSave();
    this.emit('job:created', job);

    console.log(`[JobQueue] Enqueued new job ${id} (type=${type}, user=${userId})`);

    // Kick off worker queue asynchronously
    setImmediate(() => this.processNext());

    return { job, isExisting: false };
  }

  /**
   * Retrieves a job by ID
   */
  public getJob(id: string): BackgroundJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Returns list of jobs optionally filtered
   */
  public getJobs(filter?: { userId?: string; type?: JobType; status?: JobStatus }): BackgroundJob[] {
    let list = Array.from(this.jobs.values());
    if (filter?.userId) list = list.filter((j) => j.userId === filter.userId);
    if (filter?.type) list = list.filter((j) => j.type === filter.type);
    if (filter?.status) list = list.filter((j) => j.status === filter.status);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Processes the next queued job with bounded concurrency.
   */
  private async processNext() {
    if (this.activeWorkers >= this.maxConcurrency) return;

    // Find oldest queued job
    const queuedJob = Array.from(this.jobs.values())
      .filter((j) => j.status === 'queued')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    if (!queuedJob) return;

    this.activeWorkers++;
    queuedJob.status = 'running';
    queuedJob.startedAt = new Date().toISOString();
    queuedJob.progress = {
      stage: 'starting',
      stageIndex: 0,
      totalStages: queuedJob.progress.totalStages || 5,
      percent: 5,
      details: 'Job started',
      updatedAt: new Date().toISOString(),
    };

    this.scheduleSave();
    this.emit('job:progress', queuedJob);

    const handler = this.handlers.get(queuedJob.type);
    if (!handler) {
      queuedJob.status = 'failed';
      queuedJob.error = `No handler registered for job type ${queuedJob.type}`;
      queuedJob.completedAt = new Date().toISOString();
      this.activeWorkers--;
      this.scheduleSave();
      this.emit('job:failed', queuedJob);
      setImmediate(() => this.processNext());
      return;
    }

    const updateProgress = async (stage: string, stageIndex: number, totalStages: number, details?: string) => {
      queuedJob.progress = {
        stage,
        stageIndex,
        totalStages,
        percent: Math.min(100, Math.round((stageIndex / totalStages) * 100)),
        details,
        updatedAt: new Date().toISOString(),
      };
      this.scheduleSave();
      this.emit('job:progress', queuedJob);
    };

    try {
      // Execute with timeout guard
      const executeWithTimeout = async () => {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Job timed out after ${queuedJob.timeoutMs}ms`));
          }, queuedJob.timeoutMs);
        });

        try {
          const result = await Promise.race([handler(queuedJob, updateProgress), timeoutPromise]);
          clearTimeout(timer!);
          return result;
        } finally {
          clearTimeout(timer!);
        }
      };

      const result = await executeWithTimeout();
      queuedJob.status = 'completed';
      queuedJob.result = result;
      queuedJob.completedAt = new Date().toISOString();
      queuedJob.progress = {
        stage: 'completed',
        stageIndex: queuedJob.progress.totalStages,
        totalStages: queuedJob.progress.totalStages,
        percent: 100,
        details: 'Execution successful',
        updatedAt: new Date().toISOString(),
      };
      this.scheduleSave();
      this.emit('job:completed', queuedJob);
      console.log(`[JobQueue] Completed job ${queuedJob.id} (${queuedJob.type}) in ${Date.now() - new Date(queuedJob.startedAt!).getTime()}ms`);
    } catch (err: any) {
      console.error(`[JobQueue] Error running job ${queuedJob.id} (${queuedJob.type}):`, err?.message || err);

      // Retry with exponential backoff if retries left
      if (queuedJob.retries < queuedJob.maxRetries) {
        queuedJob.retries++;
        queuedJob.status = 'queued';
        const backoffMs = Math.pow(2, queuedJob.retries) * 1000;
        console.log(`[JobQueue] Retrying job ${queuedJob.id} (attempt ${queuedJob.retries}/${queuedJob.maxRetries}) in ${backoffMs}ms`);
        setTimeout(() => this.processNext(), backoffMs);
      } else {
        queuedJob.status = 'failed';
        queuedJob.error = err?.message || 'Unknown execution error';
        queuedJob.completedAt = new Date().toISOString();
        this.scheduleSave();
        this.emit('job:failed', queuedJob);
      }
    } finally {
      this.activeWorkers--;
      setImmediate(() => this.processNext());
    }
  }
}

export const jobQueue = new JobQueueService();
