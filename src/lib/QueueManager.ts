import { Queue } from './Queue';
import { ManagerOptions } from './types';
import { EventEmitter } from 'eventemitter3';

export class QueueManager<T = any> extends EventEmitter {
  private queues: Queue<T>[];
  private concurrencyPerQueue: number;

  constructor(private options: ManagerOptions) {
    super();
    this.concurrencyPerQueue = options.concurrencyPerQueue || 1;
    this.queues = Array.from({ length: options.queueCount }, (_, i) => {
      return new Queue({ 
        defaultTimeoutMs: options.timeoutMs,
        concurrency: this.concurrencyPerQueue
      }, `queue-${i}`);
    });
    
    // Set up event forwarding from individual queues to the manager
    this.setupEventForwarding();
  }

  private setupEventForwarding() {
    this.queues.forEach((queue, index) => {
      // Forward relevant events from individual queues to the manager
      ['job:started', 'job:completed', 'job:failed', 'job:timeout', 'job:queued', 
       'worker:started', 'worker:paused', 'worker:resumed', 'worker:shutdown'].forEach(eventName => {
        queue.on(eventName, (data) => {
          this.emit(eventName, { ...data, queueIndex: index });
        });
      });
    });
  }

  async addJob(data: T): Promise<string> {
    // Find the emptiest queue (least number of total jobs pending + running)
    const target = this.queues.reduce((a, b) => {
      const totalJobsA = a.length + a.getRunningCount();
      const totalJobsB = b.length + b.getRunningCount();
      return totalJobsA <= totalJobsB ? a : b;
    });
    
    const jobId = await target.addJob(data);
    return jobId;
  }

  completeJob(jobId: string) {
    for (const queue of this.queues) {
      queue.completeJob(jobId);
    }
  }

  failJob(jobId: string, error?: Error) {
    for (const queue of this.queues) {
      queue.failJob(jobId, error);
    }
  }

  updateQueueCount(newCount: number) {
    if (newCount <= 0) {
      throw new Error('Queue count must be greater than 0');
    }

    const currentCount = this.queues.length;

    // If increasing queue count, simply add new queues
    if (newCount > currentCount) {
      const additionalQueues = Array.from(
        { length: newCount - currentCount }, 
        (_, i) => new Queue({ 
          defaultTimeoutMs: this.options.timeoutMs,
          concurrency: this.concurrencyPerQueue 
        }, `queue-${currentCount + i}`)
      );
      
      // Set up event forwarding for new queues
      additionalQueues.forEach((queue, i) => {
        const queueIndex = currentCount + i;
        ['job:started', 'job:completed', 'job:failed', 'job:timeout', 'job:queued',
         'worker:started', 'worker:paused', 'worker:resumed', 'worker:shutdown'].forEach(eventName => {
          queue.on(eventName, (data) => {
            this.emit(eventName, { ...data, queueIndex });
          });
        });
      });
      
      this.queues.push(...additionalQueues);
      this.options.queueCount = newCount;
      
      this.emit('queues:added', { 
        newCount, 
        addedCount: newCount - currentCount 
      });
      
      return;
    }

    // If decreasing queue count, redistribute jobs from removed queues
    if (newCount < currentCount) {
      const queuesToKeep = this.queues.slice(0, newCount);
      const queuesToRemove = this.queues.slice(newCount);
      
      // Collect all pending jobs from queues to be removed
      const pendingJobsToRedistribute = queuesToRemove.flatMap(queue => queue.getPendingJobs());
      
      // Shutdown the queues we're removing
      queuesToRemove.forEach(queue => {
        queue.shutdown();
      });
      
      // Update the queues array
      this.queues = queuesToKeep;
      this.options.queueCount = newCount;

      // Redistribute collected pending jobs to remaining queues
      for (const job of pendingJobsToRedistribute) {
        this.addJob(job.data);
      }
      
      this.emit('queues:removed', { 
        newCount, 
        removedCount: currentCount - newCount,
        redistributedJobs: pendingJobsToRedistribute.length
      });
    }
  }

  pauseAllQueues() {
    this.queues.forEach(queue => queue.pause());
    this.emit('all:paused');
  }
  
  resumeAllQueues() {
    this.queues.forEach(queue => queue.resume());
    this.emit('all:resumed');
  }
  
  shutdownAllQueues() {
    this.queues.forEach(queue => queue.shutdown());
    this.emit('all:shutdown');
  }
  
  updateConcurrencyPerQueue(newConcurrency: number) {
    if (newConcurrency <= 0) {
      throw new Error('Concurrency must be greater than 0');
    }
    
    this.concurrencyPerQueue = newConcurrency;
    this.options.concurrencyPerQueue = newConcurrency;
    
    // We need to recreate all queues for the concurrency to take effect
    this.updateQueueCount(this.queues.length);
    
    this.emit('concurrency:updated', { newConcurrency });
  }

  getStats() {
    return this.queues.map((q, i) => ({
      queueId: i,
      length: q.length,
      running: q.getRunningCount(),
      maxConcurrency: q.getMaxConcurrency(),
      isActive: q.isWorkerActive()
    }));
  }

  getQueues(): Queue<T>[] {
    return this.queues;
  }
} 