import { QueueManager } from './core/QueueManager';

const manager = new QueueManager({ queueCount: 3, timeoutMs: 10000 });

manager.addJob({ name: 'Request A' });
manager.addJob({ name: 'Request B' });
console.log('manager', manager);
setTimeout(() => {
  manager.completeJob('some-id'); // simulate webhook
}, 5000);
