import { EventEmitter } from 'eventemitter3';
import { Job, QueueOptions } from './types';
import { v4 as uuid } from 'uuid';

export class Queue<T = any> extends EventEmitter {  
  private queue: Job<T>[] = [];
  private runningJobs: Job<T>[] = [];
  private readonly concurrency: number;
  private readonly defaultTimeout: number;
  private id: string;
  private active = true;
  private workerTimer: NodeJS.Timeout | null = null;

  constructor(options: QueueOptions = {}, id?: string) {
    super();
    this.concurrency = options.concurrency ?? 1;
    this.defaultTimeout = options.defaultTimeoutMs ?? 30000;
    this.id = id || uuid();
    
    // Start the worker process
    this.startWorker();
  }

  async addJob(data: T, timeoutMs?: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const jobId = uuid();
      const job: Job<T> = {
        id: jobId,
        data,
        createdAt: Date.now(),
        status: 'pending',
        timeoutMs: timeoutMs ?? this.defaultTimeout,
        onComplete: () => resolve(jobId),
        onError: (err) => reject(err),
      };

      this.queue.push(job);
      this.emit('job:queued', job);
      
      // No need to call tryRun here - the worker will handle it
      return jobId;
    });
  }

  private startWorker() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
    }
    
    // Create a continuous worker that checks for jobs to process
    this.workerTimer = setInterval(() => {
      if (!this.active) return;
      this.processNextJobs();
    }, 100); // Check for new jobs every 100ms
    
    this.emit('worker:started', { queueId: this.id });
  }
  
  private processNextJobs() {
    // If we're at max concurrency or no jobs in queue, don't do anything
    if (this.runningJobs.length >= this.concurrency || this.queue.length === 0) return;
    
    // Calculate how many new jobs we can start
    const slotsAvailable = this.concurrency - this.runningJobs.length;
    const jobsToStart = Math.min(slotsAvailable, this.queue.length);
    
    // Start jobs
    for (let i = 0; i < jobsToStart; i++) {
      this.startJob(this.queue.shift()!);
    }
  }
  
  private startJob(job: Job<T>) {
    job.status = 'running';
    job.startedAt = Date.now();
    this.runningJobs.push(job);
    
    this.emit('job:started', job);
    
    // Set timeout for this job
    const timeout = setTimeout(() => {
      this.handleJobTimeout(job);
    }, job.timeoutMs);
    
    // Store timeout ref in job
    job.timeoutRef = timeout;
    
    // Set up listeners for job completion or failure
    this.once(`job:complete:${job.id}`, () => {
      this.handleJobCompletion(job);
    });
    
    this.once(`job:fail:${job.id}`, (error?: Error) => {
      this.handleJobFailure(job, error);
    });
  }
  
  private handleJobCompletion(job: Job<T>) {
    if (job.timeoutRef) clearTimeout(job.timeoutRef);
    
    job.status = 'completed';
    job.completedAt = Date.now();
    
    // Remove from running jobs
    this.removeRunningJob(job);
    
    // Notify listeners
    job.onComplete?.();
    this.emit('job:completed', job);
  }
  
  private handleJobFailure(job: Job<T>, error?: Error) {
    if (job.timeoutRef) clearTimeout(job.timeoutRef);
    
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error || new Error('Job failed without specific error');
    
    // Remove from running jobs
    this.removeRunningJob(job);
    
    // Notify listeners
    job.onError?.(job.error);
    this.emit('job:failed', job);
  }
  
  private handleJobTimeout(job: Job<T>) {
    job.status = 'timed_out';
    job.completedAt = Date.now();
    
    // Remove from running jobs
    this.removeRunningJob(job);
    
    // Notify listeners
    job.onComplete?.(); // We resolve on timeout rather than reject
    this.emit('job:timeout', job);
  }
  
  private removeRunningJob(job: Job<T>) {
    const index = this.runningJobs.findIndex(j => j.id === job.id);
    if (index !== -1) {
      this.runningJobs.splice(index, 1);
    }
  }

  public completeJob(jobId: string) {
    this.emit(`job:complete:${jobId}`);
  }

  public failJob(jobId: string, error?: Error) {
    this.emit(`job:fail:${jobId}`, error);
  }
  
  public pause() {
    this.active = false;
    this.emit('worker:paused', { queueId: this.id });
  }
  
  public resume() {
    this.active = true;
    this.emit('worker:resumed', { queueId: this.id });
  }
  
  public shutdown() {
    this.active = false;
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
    this.emit('worker:shutdown', { queueId: this.id });
  }

  public get length() {
    return this.queue.length;
  }

  public getRunningCount() {
    return this.runningJobs.length;
  }

  public getMaxConcurrency() {
    return this.concurrency;
  }

  public isWorkerActive() {
    return this.active;
  }

  public getPendingJobs(): Job<T>[] {
    // Return a copy of pending jobs
    return [...this.queue];
  }

  public getRunningJobs(): Job<T>[] {
    // Return a copy of running jobs
    return [...this.runningJobs];
  }
  
  public getQueueId(): string {
    return this.id;
  }
}
