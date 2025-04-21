# Turntable Queue

A drop-in persistent job queue system for Node.js projects using Prisma and Supabase.

## Features

- **Persistent Queue**: Store jobs in your Supabase PostgreSQL database
- **Automatic Recovery**: Automatically recover jobs after server restart or crashes
- **Minimal Setup**: Just run one command to set up your Prisma schema
- **Batch Processing**: Efficient database operations with batching
- **Scale On Demand**: Add or remove worker queues at runtime
- **Express Integration**: Easy to integrate with your Express app

## Quick Start

### 1. Install the package

```bash
npm install turntable-queue @prisma/client
```

### 2. Set up your Prisma schema

The easiest way is to use our setup script:

```bash
npx turntable-setup
```

This will add the required Job model to your Prisma schema. Then run a migration:

```bash
npx prisma migrate dev --name add_job_queue
```

### 3. Start using the queue in your app

```typescript
import { PersistentQueueManager } from 'turntable-queue';
import { PrismaClient } from '@prisma/client';

// Create a Prisma client (optional)
const prisma = new PrismaClient();

// Create a persistent queue manager
const queueManager = new PersistentQueueManager({
  queueCount: 2,                      // Number of worker queues
  concurrencyPerQueue: 3,             // Jobs processed concurrently per queue
  prismaClient: prisma,               // Use your existing Prisma client
  autoCleanupDays: 7,                 // Auto-clean completed jobs after 7 days
});

// Listen for events (optional)
queueManager.on('job:completed', (data) => {
  console.log(`Job ${data.id} completed!`);
});

// Add a job to the queue
const jobId = await queueManager.addJob({
  task: 'process-image',
  data: { imageUrl: 'https://example.com/image.jpg' }
});

console.log(`Job added with ID: ${jobId}`);

// Mark a job as complete (e.g., after processing)
queueManager.completeJob(jobId);

// Mark a job as failed
queueManager.failJob(jobId, new Error('Processing failed'));

// Clean up resources on shutdown
process.on('SIGTERM', async () => {
  await queueManager.shutdown();
});
```

## Express Integration Example

```typescript
import express from 'express';
import { PersistentQueueManager } from 'turntable-queue';

const app = express();
app.use(express.json());

const queueManager = new PersistentQueueManager({
  queueCount: 2,
  autoCleanupDays: 7
});

// Add a job endpoint
app.post('/api/jobs', async (req, res) => {
  try {
    const jobId = await queueManager.addJob(req.body);
    res.status(202).json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for external service to mark job as complete
app.post('/api/webhook', (req, res) => {
  const { jobId, status, error } = req.body;
  
  if (status === 'success') {
    queueManager.completeJob(jobId);
  } else {
    queueManager.failJob(jobId, new Error(error || 'Job failed'));
  }
  
  res.json({ success: true });
});

app.listen(3000);
```

## Configuration Options

The `PersistentQueueManager` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `queueCount` | Number of parallel queues | Required |
| `concurrencyPerQueue` | Jobs processed concurrently per queue | 1 |
| `timeoutMs` | Default job timeout (milliseconds) | 30000 |
| `prismaClient` | Your existing Prisma client | Auto-created |
| `autoCleanupDays` | Auto-clean completed jobs older than X days | 0 (disabled) |
| `cleanupInterval` | How often to run cleanup (milliseconds) | 86400000 (1 day) |
| `persistenceBatchSize` | Number of jobs in a batch operation | 100 |

## Scaling

You can dynamically adjust the number of queues:

```typescript
// Add more processing capacity
await queueManager.updateQueueCount(5);

// Scale down when load is lower
await queueManager.updateQueueCount(2);
```

Jobs from removed queues are automatically redistributed to remaining queues.

## Using with Existing Prisma Projects

If you already have a complex Prisma schema, you can manually add the Job model:

```prisma
enum JobStatus {
  pending
  running
  completed
  failed
  timed_out
}

model Job {
  id          String    @id
  data        Json
  status      JobStatus @default(pending)
  queueIndex  Int
  createdAt   DateTime  @default(now())
  startedAt   DateTime?
  completedAt DateTime?
  timeoutMs   Int?
  error       String?
  retryCount  Int       @default(0)
  
  @@index([status])
  @@index([queueIndex, status])
}
```

Then run `npx prisma generate` to update your Prisma client.

## License

MIT 
