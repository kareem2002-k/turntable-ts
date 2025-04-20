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

  updateQueueCount(newCount: number) {
    // implement logic to safely resize queues
  }

  getStats() {
    return this.queues.map((q, i) => ({
      queueId: i,
      length: q.length,
      running: q.isRunning(),
    }));
  }
}
