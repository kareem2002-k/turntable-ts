# Client Integration Example

This example demonstrates how to integrate the turntable-queue with an existing application schema.

## Overview

Many applications already have their own database schema. This example shows how to:

1. Add the necessary queue models to your existing schema
2. Configure the queue to work with your database
3. Use the queue in your application

## Schema Integration

The `schema.prisma` file in this example shows:

- A sample application schema with `User`, `Post`, `Product`, `Order`, and `OrderItem` models
- The required turntable-queue models (`Job` and `JobStatus` enum)

To integrate with your own schema:

1. Copy the `Job` model and `JobStatus` enum definitions to your schema
2. Run `npx prisma db push` or `npx prisma migrate dev` to update your database

## Usage with Existing Schema

```typescript
import { PrismaClient } from '@prisma/client';
import { QueueManager } from 'turntable-queue';

// Initialize your Prisma client
const prisma = new PrismaClient();

// Initialize the queue manager with your Prisma client
const queueManager = new QueueManager({ 
  prisma, 
  pollingInterval: 1000 
});

// Define a queue with a processor
const emailQueue = queueManager.createQueue('email', async (job) => {
  const { to, subject, body } = job.payload;
  
  // Your email sending logic
  console.log(`Sending email to ${to}`);
  
  // You can interact with your own models
  await prisma.user.update({
    where: { email: to },
    data: { lastEmailSent: new Date() }
  });
  
  return { success: true };
});

// Add a job to the queue
await emailQueue.addJob({
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thank you for signing up.'
});

// Start processing (typically in a worker process)
await queueManager.start();
```

## Transactions

You can use transactions to ensure database consistency between your application models and queue operations:

```typescript
await prisma.$transaction(async (tx) => {
  // Create an order
  const order = await tx.order.create({
    data: {
      customerId: 'user-id',
      items: {
        create: [{
          quantity: 1,
          productId: 'product-id'
        }]
      }
    }
  });
  
  // Add job to process the order within the same transaction
  // Pass the transaction client to addJob
  await queueManager.getQueue('orders').addJob(
    { orderId: order.id },
    { prisma: tx }
  );
});
```

## Schema Considerations

When adding the queue models to your existing schema:

- Ensure there are no naming conflicts with your models
- The queue requires only the `Job` model and `JobStatus` enum
- You can customize the model names if needed by configuring the QueueManager 