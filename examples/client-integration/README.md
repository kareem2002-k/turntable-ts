# Client Integration Example

This example demonstrates how to integrate the turntable-queue with an existing application schema.

## Overview

Many applications already have their own database schema. This example shows how to:

1. Add the necessary queue models to your existing schema
2. Configure the queue to work with your database
3. Use the queue in your application

## Setup

This example uses a PostgreSQL database hosted on Supabase. We've provided a simplified setup script that handles everything automatically:

```bash
npm run install-all
```

This will:
1. Set up the environment variables with the Supabase connection strings
2. Build the turntable-queue library
3. Install dependencies for the example
4. Push the database schema to Supabase
5. Seed the database with sample data

## Starting the Application

After setup is complete, start the application:

```bash
npm start
```

## Usage

Once the server is running, you can use the following API endpoints:

- **Create an order**: POST to `/orders`
  ```bash
  curl -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-id-here","items":[{"productId":"product-id-here","quantity":2}]}'
  ```

- **Check order status**: GET `/orders/:id`
  ```bash
  curl http://localhost:3000/orders/order-id-here
  ```

The setup script will provide you with a ready-to-use curl command with valid user and product IDs.

## How it Works

This example demonstrates:

1. **Prisma Integration**: The queue system uses your existing Prisma client
2. **Job Processing**: When orders are created, three jobs are added to the queue:
   - Payment processing
   - Inventory update
   - Order confirmation email
3. **Transaction Support**: The inventory update uses a transaction for data consistency
4. **Event-driven Processing**: Jobs are processed asynchronously

## Schema Integration

The `schema.prisma` file in this example shows:

- A sample application schema with `User`, `Product`, `Order`, and `OrderItem` models
- The required turntable-queue models (`Job` and `JobStatus` enum)

To integrate with your own schema:

1. Copy the `Job` model and `JobStatus` enum definitions to your schema
2. Run `npx prisma db push` or `npx prisma migrate dev` to update your database

## Key Implementation Details

### Queue Setup

```typescript
// Set up the queue manager with our Prisma client
const queueManager = new PersistentQueueManager({
  prismaClient: prisma,           // Pass our Prisma client instance
  queueCount: 2,                  // Use 2 parallel queues
  concurrencyPerQueue: 3,         // Each queue processes 3 jobs at once
  timeoutMs: 60000,               // Jobs timeout after 60 seconds
});
```

### Job Processing

```typescript
// Add job processor event listener
queueManager.on('job:started', async (job) => {
  try {
    await processOrderJob(job.data);
    queueManager.completeJob(job.id);
  } catch (error) {
    queueManager.failJob(job.id, error);
  }
});
```

### Adding Jobs

```typescript
// Queue the order processing jobs
await queueManager.addJob({ orderId: order.id, action: 'process_payment' });
await queueManager.addJob({ orderId: order.id, action: 'update_inventory' });
await queueManager.addJob({ orderId: order.id, action: 'send_confirmation' });
``` 