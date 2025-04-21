import { Queue } from './Queue';
import { ManagerOptions } from './types';
import { EventEmitter } from 'eventemitter3';
import { PersistenceService } from './PersistenceService';

export class QueueManager<T = any> extends EventEmitter {
  private queues: Queue<T>[];
  private concurrencyPerQueue: number;
  private persistenceService?: PersistenceService<T>;

  constructor(private options: ManagerOptions) {
    super();
    this.concurrencyPerQueue = options.concurrencyPerQueue || 1;
    
    // Initialize persistence service if enabled
    if (options.persistence !== false) {
      if (options.prismaClient) {
        this.persistenceService = new PersistenceService<T>({
          prismaClient: options.prismaClient,
          batchSize: options.persistenceBatchSize ||
          100
        });
      } else {
        console.warn('Warning: Persistence enabled but no prismaClient provided. Persistence will be disabled.');
      }
    }
    
    // Initialize queues
    this.queues = [];
    this.initializeQueues();
  }

  private async initializeQueues() {
    let recoveredJobs: { [queueIndex: number]: any[] } = {};
    
    // If persistence is enabled, try to recover jobs
    if (this.persistenceService) {
      try {
        recoveredJobs = await this.persistenceService.recoverJobs(this.options.queueCount);
        console.log(`Recovered jobs from database: ${Object.values(recoveredJobs).flat().length} jobs`);
      } catch (error) {
        console.error('Error recovering jobs from database:', error);
      }
    }
    
    // Create the queues
    this.queues = Array.from({ length: this.options.queueCount }, (_, i) => {
      return new Queue<T>({ 
        defaultTimeoutMs: this.options.timeoutMs,
        concurrency: this.concurrencyPerQueue
      }, `queue-${i}`);
    });
    
    // Set up event forwarding from individual queues to the manager
    this.setupEventForwarding();
    
    // Add recovered jobs back to their respective queues
    if (this.persistenceService) {
      for (const [queueIndexStr, jobs] of Object.entries(recoveredJobs)) {
        const queueIndex = parseInt(queueIndexStr);
        if (queueIndex < this.queues.length) {
          for (const job of jobs) {
            // Add job directly to the queue without creating a new id
            await this.queues[queueIndex].addExistingJob(job);
          }
        }
      }
    }
  }

  private setupEventForwarding() {
    this.queues.forEach((queue, index) => {
      // Forward relevant events from individual queues to the manager
      ['job:started', 'job:completed', 'job:failed', 'job:timeout', 'job:queued', 
       'worker:started', 'worker:paused', 'worker:resumed', 'worker:shutdown'].forEach(eventName => {
        queue.on(eventName, (data) => {
          // Add to persistence if enabled
          if (this.persistenceService && eventName.startsWith('job:')) {
            if (eventName === 'job:queued') {
              this.persistenceService.persistJob(data, index);
            } else if (eventName === 'job:started') {
              this.persistenceService.updateJobStatus(data.id, 'running');
            } else if (eventName === 'job:completed') {
              this.persistenceService.updateJobStatus(data.id, 'completed');
            } else if (eventName === 'job:failed') {
              this.persistenceService.updateJobStatus(data.id, 'failed', data.error);
            } else if (eventName === 'job:timeout') {
              this.persistenceService.updateJobStatus(data.id, 'timed_out');
            }
          }
          
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

  async updateQueueCount(newCount: number) {
    if (newCount <= 0) {
      throw new Error('Queue count must be greater than 0');
    }

    const currentCount = this.queues.length;

    // If increasing queue count, simply add new queues
    if (newCount > currentCount) {
      const additionalQueues = Array.from(
        { length: newCount - currentCount }, 
        (_, i) => new Queue<T>({ 
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
            // Add to persistence if enabled
            if (this.persistenceService && eventName.startsWith('job:')) {
              if (eventName === 'job:queued') {
                this.persistenceService.persistJob(data, queueIndex);
              } else if (eventName === 'job:started') {
                this.persistenceService.updateJobStatus(data.id, 'running');
              } else if (eventName === 'job:completed') {
                this.persistenceService.updateJobStatus(data.id, 'completed');
              } else if (eventName === 'job:failed') {
                this.persistenceService.updateJobStatus(data.id, 'failed', data.error);
              } else if (eventName === 'job:timeout') {
                this.persistenceService.updateJobStatus(data.id, 'timed_out');
              }
            }
            
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
        // If persistence is enabled, update the queue index
        if (this.persistenceService) {
          // Find the emptiest queue
          const targetQueue = this.queues.reduce((a, b) => {
            const totalJobsA = a.length + a.getRunningCount();
            const totalJobsB = b.length + b.getRunningCount();
            return totalJobsA <= totalJobsB ? a : b;
          });
          
          const targetIndex = this.queues.indexOf(targetQueue);
          
          // Update in persistence
          await this.persistenceService.persistJob(job, targetIndex);
          
          // Add to queue, reusing the existing job object
          await targetQueue.addExistingJob(job);
        } else {
          // Just add the job data if no persistence
          this.addJob(job.data);
        }
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
  
  async shutdownAllQueues() {
    this.queues.forEach(queue => queue.shutdown());
    
    // Shutdown persistence service if enabled
    if (this.persistenceService) {
      await this.persistenceService.shutdown();
    }
    
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
  
  /**
   * Run a job cleanup operation to remove old completed jobs
   */
  async cleanupOldJobs(ageInDays: number = 7): Promise<number> {
    if (!this.persistenceService) {
      return 0;
    }
    
    return await this.persistenceService.cleanupOldJobs(ageInDays);
  }
}
