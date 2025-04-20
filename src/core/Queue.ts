import { EventEmitter } from 'eventemitter3';
import { Job, QueueOptions } from './types';
import { v4 as uuid } from 'uuid';

export class Queue<T = any> extends EventEmitter {  
  private queue: Job<T>[] = [];
  private running = false;
  private readonly concurrency: number;
  private readonly defaultTimeout: number;

  constructor(options: QueueOptions = {}) {
    super();
    this.concurrency = options.concurrency ?? 1;
    this.defaultTimeout = options.defaultTimeoutMs ?? 30000;
  }

  async addJob(data: T, timeoutMs?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const job: Job = {
        id: uuid(),
        data,
        createdAt: Date.now(),
        status: 'pending',
        timeoutMs: timeoutMs ?? this.defaultTimeout,
        resolve,
        reject,
      };

      this.queue.push(job);
      this.tryRun();
    });
  }

  private async tryRun() {
    if (this.running || this.queue.length === 0) return;

    this.running = true;
    const job = this.queue[0];
    job.status = 'running';
    this.emit('job:started', job);

    const timeout = setTimeout(() => {
      job.status = 'timed_out';
      job.resolve();
      this.emit('job:timeout', job);
      this.next();
    }, job.timeoutMs);

    this.once(`job:complete:${job.id}`, () => {
      clearTimeout(timeout);
      job.status = 'completed';
      job.resolve();
      this.next();
    });

    this.once(`job:fail:${job.id}`, (error?: Error) => {
      clearTimeout(timeout);
      job.status = 'failed';
      if (error) {
        job.reject(error);
      } else {
        job.reject(new Error('Job failed without specific error'));
      }
      this.next();
    });
  }

  public completeJob(jobId: string) {
    this.emit(`job:complete:${jobId}`);
  }

  public failJob(jobId: string, error?: Error) {
    this.emit(`job:fail:${jobId}`, error);
  }

  private next() {
    this.queue.shift();
    this.running = false;
    this.tryRun();
  }

  public get length() {
    return this.queue.length;
  }

  public isRunning() {
    return this.running;
  }

  public getPendingJobs(): Job<T>[] {
    // Return a copy of all jobs that are not running (index > 0)
    return this.queue.slice(1);
  }

  public getCurrentJob(): Job<T> | null {
    // Return the currently running job, if any
    return this.running && this.queue.length > 0 ? this.queue[0] : null;
  }
}
