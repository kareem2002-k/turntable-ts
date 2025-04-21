// Main classes
export { QueueManager } from './core/QueueManager';
export { PersistentQueueManager } from './core/PersistentQueueManager';
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

// Add a default export with basic information
export default {
  name: 'turntable-queue',
  description: 'Persistent job queue system with Prisma/Supabase integration',
  version: '1.0.0'
};
