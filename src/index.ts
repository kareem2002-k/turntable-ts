// Main classes
export { QueueManager } from './core/QueueManager';
export { PersistentQueueManager } from './core/PersistentQueueManager';
export { Queue } from './core/Queue';
export { PersistenceService } from './core/PersistenceService';
export { createQueueApiRoutes } from './lib/ApiIntegration';

// Types
export type { 
  Job, 
  JobStatus, 
  QueueOptions, 
  ManagerOptions 
} from './core/types';

export type { 
  PersistentQueueOptions 
} from './core/PersistentQueueManager';

export type {
  WebhookCallback,
  JobRequest
} from './lib/types';

export type {
  ApiIntegrationOptions
} from './lib/ApiIntegration';

/**
 * Create a simple queue manager with persistence for Prisma/Supabase
 * @param options Configuration options including Prisma client
 * @returns A configured queue manager
 */
export function createQueue(options: {
  prismaClient: any;
  queueCount?: number;
  concurrencyPerQueue?: number;
  timeoutMs?: number;
  autoCleanupDays?: number;
}) {
  // Import dynamically to avoid circular dependencies
  const PersistentQueueManager = require('./core/PersistentQueueManager').PersistentQueueManager;
  
  const queueManager = new PersistentQueueManager({
    prismaClient: options.prismaClient,
    queueCount: options.queueCount || 2,
    concurrencyPerQueue: options.concurrencyPerQueue || 1,
    timeoutMs: options.timeoutMs || 30000,
    autoCleanupDays: options.autoCleanupDays || 0
  });
  
  return queueManager;
}

// Add a default export with basic information
export default {
  name: 'turntable-queue',
  description: 'Persistent job queue system with Prisma/Supabase integration',
  version: '1.0.0',
  createQueue
};
