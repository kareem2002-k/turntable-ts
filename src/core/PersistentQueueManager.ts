import { QueueManager } from './QueueManager';
import { Job, ManagerOptions } from './types';

export interface PersistentQueueOptions extends ManagerOptions {
  /**
   * Prisma client instance - required
   */
  prismaClient: any;
  
  /**
   * Automatically clean up completed jobs older than this many days (set to 0 to disable)
   */
  autoCleanupDays?: number;
  
  /**
   * How often to run cleanup (in milliseconds)
   */
  cleanupInterval?: number;
}

/**
 * A QueueManager with built-in Prisma persistence
 * This is the main class users should interact with for a persistent queue
 */
export class PersistentQueueManager<T = any> extends QueueManager<T> {
  private prisma: any;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private autoCleanupDays: number;

  /**
   * Create a new PersistentQueueManager
   * 
   * @param options Configuration options including Prisma client
   */
  constructor(options: PersistentQueueOptions) {
    // Make sure persistence is enabled
    super({
      ...options,
      persistence: true,
      persistenceBatchSize: options.persistenceBatchSize || 100
    });
    
    // Set up the Prisma client
    if (!options.prismaClient) {
      throw new Error('PersistentQueueManager requires a prismaClient option');
    }
    
    this.prisma = options.prismaClient;
    
    // Set up auto-cleanup if enabled
    this.autoCleanupDays = options.autoCleanupDays || 0;
    if (this.autoCleanupDays > 0) {
      const interval = options.cleanupInterval || 24 * 60 * 60 * 1000; // Default to once a day
      this.startCleanupTimer(interval);
    }
  }
  
  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(interval: number) {
    this.cleanupTimer = setInterval(async () => {
      try {
        const count = await this.cleanupOldJobs(this.autoCleanupDays);
        console.log(`[PersistentQueueManager] Auto-cleaned ${count} completed jobs`);
      } catch (error) {
        console.error('[PersistentQueueManager] Error during auto-cleanup:', error);
      }
    }, interval);
  }
  
  /**
   * Get the Prisma client used by this manager
   * Useful if you want to perform custom queries
   */
  getPrismaClient(): any {
    return this.prisma;
  }
  
  /**
   * Properly shut down the queue manager and Prisma connection
   */
  async shutdown(): Promise<void> {
    // Clear any cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Shut down queues
    await this.shutdownAllQueues();
  }
  
  /**
   * Get all jobs with a specific status
   * 
   * @param status The job status to filter by
   * @returns Array of jobs
   */
  async getJobsByStatus(status: string): Promise<Job<T>[]> {
    const jobs = await this.prisma.job.findMany({
      where: { status: status as any }
    });
    
    return jobs.map((job: any) => ({
      id: job.id,
      data: job.data as unknown as T,
      createdAt: new Date(job.createdAt).getTime(),
      status: job.status as any,
      timeoutMs: job.timeoutMs || undefined,
      startedAt: job.startedAt ? new Date(job.startedAt).getTime() : undefined,
      completedAt: job.completedAt ? new Date(job.completedAt).getTime() : undefined,
      error: job.error ? new Error(job.error) : undefined
    }));
  }
} 