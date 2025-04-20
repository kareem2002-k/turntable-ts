import { Queue } from './Queue';
import { ManagerOptions } from './types';

export class QueueManager<T = any> {
  private queues: Queue<T>[];

  constructor(private options: ManagerOptions) {
    this.queues = Array.from({ length: options.queueCount }, () => new Queue({ defaultTimeoutMs: options.timeoutMs }));
  }

  async addJob(data: T) {
    const target = this.queues.reduce((a, b) => (a.length <= b.length ? a : b));
    await target.addJob(data);
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
        () => new Queue({ defaultTimeoutMs: this.options.timeoutMs })
      );
      this.queues.push(...additionalQueues);
      this.options.queueCount = newCount;
      return;
    }

    // If decreasing queue count, redistribute jobs from removed queues
    if (newCount < currentCount) {
      const queuesToKeep = this.queues.slice(0, newCount);
      const queuesToRemove = this.queues.slice(newCount);
      
      // Collect all pending jobs from queues to be removed
      const jobsToRedistribute = queuesToRemove.flatMap(queue => queue.getPendingJobs());
      
      // Update the queues array
      this.queues = queuesToKeep;
      this.options.queueCount = newCount;

      // Redistribute collected jobs to remaining queues
      jobsToRedistribute.forEach(job => {
        this.addJob(job.data);
      });
    }
  }

  getStats() {
    return this.queues.map((q, i) => ({
      queueId: i,
      length: q.length,
      running: q.isRunning(),
    }));
  }
}
