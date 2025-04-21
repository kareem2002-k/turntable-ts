# Integrating Turntable-Queue with Your Existing Database

This guide walks you through integrating turntable-queue with your existing Prisma database schema.

## 1. Update your Prisma Schema

First, add the necessary Job model to your existing schema as shown in `schema.prisma`. The Job model is required for queue functionality:

```prisma
enum JobStatus {
  PENDING
  ACTIVE
  COMPLETED
  FAILED
  CANCELLED
}

model Job {
  id         String    @id @default(uuid())
  queue      String
  payload    Json
  status     JobStatus @default(PENDING)
  priority   Int       @default(0)
  maxRetries Int       @default(3)
  retries    Int       @default(0)
  error      String?
  startAfter DateTime?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([queue, status, priority, startAfter])
  @@index([status])
}
```

## 2. Generate and run migrations

After updating your schema, generate and apply the database migration:

```bash
npx prisma migrate dev --name add_job_queue
```

## 3. Install turntable-queue

Install the package from npm:

```bash
npm install turntable-queue
# or
yarn add turntable-queue
```

## 4. Initialize the QueueManager

In your application code, initialize the QueueManager with your Prisma client:

```typescript
import { PrismaClient } from '@prisma/client';
import { QueueManager } from 'turntable-queue';

// Initialize your Prisma client
const prisma = new PrismaClient();

// Initialize the QueueManager with your Prisma client
const queueManager = new QueueManager(prisma);
```

## 5. Define your queues

Define your application-specific queues:

```typescript
// Define a queue for order processing
const orderQueue = queueManager.createQueue('orders', {
  concurrency: 5,
  retryStrategy: {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelayMs: 1000,
  },
});

// Add handlers for processing jobs
orderQueue.process('verifyInventory', async (job) => {
  // Your job processing logic
  const orderId = job.payload.orderId;
  // ...process the job
});

orderQueue.process('processPayment', async (job) => {
  // Your payment processing logic
});

// ...add more handlers for different job types
```

## 6. Start the queue worker

Start the queue worker in your application:

```typescript
// Start processing all queues
await queueManager.start();

// For graceful shutdown
process.on('SIGTERM', async () => {
  await queueManager.stop();
  await prisma.$disconnect();
  process.exit(0);
});
```

See the `order-processing.ts` example for a complete implementation. 