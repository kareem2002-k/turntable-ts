// Export main components
export { QueueManager } from './core/QueueManager';
export { Queue } from './core/Queue';

// Export types
export * from './core/types';

// Export API integration helpers
export * from './lib/ApiIntegration';

// Export examples/helpers
export { TaskConnector, createTaskConnector } from './examples/task-connector';

// Add a default export with basic information
export default {
  name: 'turntable-queue',
  description: 'Multi-threaded job queue system with concurrent processing',
  version: '1.0.0'
};
