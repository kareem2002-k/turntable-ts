import { PrismaClient, Job as PrismaJob, JobStatus as PrismaJobStatus } from '@prisma/client';
import { Job, JobStatus } from './types';
import { v4 as uuid } from 'uuid';

/**
 * Handles persisting queue jobs to the database and recovering them
 */
export class PersistenceService<T = any> {
  private prisma: PrismaClient;
  private batchSize: number = 100; // Number of jobs to batch in a single operation
  private isSyncing: boolean = false;
  private pendingSyncJobs: Map<string, Job<T>> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  
  constructor(options: { batchSize?: number } = {}) {
    this.prisma = new PrismaClient();
    if (options.batchSize) {
      this.batchSize = options.batchSize;
    }
    
    // Start the sync process
    this.startSyncProcess();
  }
  
  /**
   * Start the sync process that batch persists jobs
   */
  private startSyncProcess() {
    this.syncInterval = setInterval(async () => {
      if (this.isSyncing || this.pendingSyncJobs.size === 0) return;
      
      try {
        this.isSyncing = true;
        await this.flushPendingJobs();
      } catch (error) {
        console.error('Error syncing jobs to database:', error);
      } finally {
        this.isSyncing = false;
      }
    }, 500); // Sync every 500ms
  }
  
  /**
   * Persist a job to the database
   */
  async persistJob(job: Job<T>, queueIndex: number): Promise<void> {
    // Add to pending sync queue - will be flushed in batches
    this.pendingSyncJobs.set(job.id, { ...job, queueIndex });
  }
  
  /**
   * Flush pending jobs to the database in a batch
   */
  private async flushPendingJobs(): Promise<void> {
    if (this.pendingSyncJobs.size === 0) return;
    
    // Take up to batchSize jobs from the pending map
    const jobsToSync = Array.from(this.pendingSyncJobs.entries())
      .slice(0, this.batchSize)
      .map(([id, job]) => ({
        id,
        job
      }));
    
    // Remove these jobs from the pending map  
    for (const { id } of jobsToSync) {
      this.pendingSyncJobs.delete(id);
    }
    
    // Create a batch transaction
    await this.prisma.$transaction(
      jobsToSync.map(({ id, job }) => {
        const queueIndex = (job as any).queueIndex ?? 0;
        delete (job as any).queueIndex; // Remove internal property
        
        return this.prisma.job.upsert({
          where: { id: job.id },
          create: {
            id: job.id,
            data: job.data as any,
            status: this.mapStatusToPrisma(job.status),
            queueIndex,
            timeoutMs: job.timeoutMs || null,
            createdAt: new Date(job.createdAt),
            startedAt: job.startedAt ? new Date(job.startedAt) : null,
            completedAt: job.completedAt ? new Date(job.completedAt) : null,
            error: job.error?.message || null,
          },
          update: {
            status: this.mapStatusToPrisma(job.status),
            startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
            completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
            error: job.error?.message || undefined,
          }
        });
      })
    );
  }
  
  /**
   * Update job status
   */
  async updateJobStatus(jobId: string, status: JobStatus, error?: Error): Promise<void> {
    // Check if in memory first
    if (this.pendingSyncJobs.has(jobId)) {
      const job = this.pendingSyncJobs.get(jobId)!;
      job.status = status;
      if (error) job.error = error;
      if (status === 'running' && !job.startedAt) job.startedAt = Date.now();
      if (['completed', 'failed', 'timed_out'].includes(status) && !job.completedAt) {
        job.completedAt = Date.now();
      }
      return;
    }
    
    // Otherwise update in database
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: this.mapStatusToPrisma(status),
        startedAt: status === 'running' ? new Date() : undefined,
        completedAt: ['completed', 'failed', 'timed_out'].includes(status) ? new Date() : undefined,
        error: error?.message || undefined
      }
    });
  }
  
  /**
   * Recover jobs from database after restart
   */
  async recoverJobs(queueCount: number): Promise<{ [queueIndex: number]: Job<T>[] }> {
    // Ensure any pending jobs are saved
    await this.flushPendingJobs();
    
    // Find all jobs that were in progress or pending
    const recoveredJobs = await this.prisma.job.findMany({
      where: {
        status: {
          in: ['pending', 'running']
        }
      }
    });
    
    // Group by queue index, but redistribute if queue count has changed
    const jobsByQueue: { [queueIndex: number]: Job<T>[] } = {};
    
    for (let i = 0; i < queueCount; i++) {
      jobsByQueue[i] = [];
    }
    
    for (const prismaJob of recoveredJobs) {
      // Make sure we don't put jobs in queues that no longer exist
      let targetQueueIndex = prismaJob.queueIndex;
      if (targetQueueIndex >= queueCount) {
        targetQueueIndex = targetQueueIndex % queueCount;
      }
      
      // Convert back to our Job model
      const job: Job<T> = {
        id: prismaJob.id,
        data: prismaJob.data as unknown as T,
        createdAt: new Date(prismaJob.createdAt).getTime(),
        status: this.mapStatusFromPrisma(prismaJob.status),
        timeoutMs: prismaJob.timeoutMs || undefined,
        startedAt: prismaJob.startedAt ? new Date(prismaJob.startedAt).getTime() : undefined,
        completedAt: prismaJob.completedAt ? new Date(prismaJob.completedAt).getTime() : undefined,
        error: prismaJob.error ? new Error(prismaJob.error) : undefined
      };
      
      // Set all recovered running jobs back to pending
      if (job.status === 'running') {
        job.status = 'pending';
        // Update in database too
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'pending' }
        });
      }
      
      jobsByQueue[targetQueueIndex].push(job);
    }
    
    return jobsByQueue;
  }
  
  /**
   * Clean up completed/failed jobs
   */
  async cleanupOldJobs(ageInDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ageInDays);
    
    const { count } = await this.prisma.job.deleteMany({
      where: {
        status: {
          in: ['completed', 'failed', 'timed_out']
        },
        completedAt: {
          lt: cutoffDate
        }
      }
    });
    
    return count;
  }
  
  /**
   * Map our status to Prisma status
   */
  private mapStatusToPrisma(status: JobStatus): PrismaJobStatus {
    return status as PrismaJobStatus; // They should be the same
  }
  
  /**
   * Map Prisma status to our status
   */
  private mapStatusFromPrisma(status: PrismaJobStatus): JobStatus {
    return status as JobStatus; // They should be the same
  }
  
  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // Flush any pending jobs
    if (this.pendingSyncJobs.size > 0) {
      await this.flushPendingJobs();
    }
    
    await this.prisma.$disconnect();
  }
} 