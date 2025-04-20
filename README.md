# Turntable Queue

A powerful multi-threaded job queue system with concurrent processing, designed for Node.js applications.

## Features

- Multiple independent queues (threads) that can process jobs concurrently
- Configurable concurrency per queue for maximum performance
- Built-in support for job timeouts and error handling
- Express.js API integration for easy web API usage
- Webhook handling for external service callbacks
- Event-based architecture for real-time monitoring

## Installation

```bash
npm install turntable-queue
# or
yarn add turntable-queue
# or
pnpm add turntable-queue
```

## Basic Usage

### Initialize the Queue Manager

```typescript
import { QueueManager } from 'turntable-queue';

// Create a queue manager with 3 queues, each processing 2 jobs concurrently
const queueManager = new QueueManager({
  queueCount: 3,
  timeoutMs: 30000, // 30 seconds default timeout
  concurrencyPerQueue: 2
});

// Listen to queue events
queueManager.on('job:started', (data) => {
  console.log(`Job ${data.id} started in queue #${data.queueIndex}`);
});

queueManager.on('job:completed', (data) => {
  console.log(`Job ${data.id} completed in queue #${data.queueIndex}`);
});

// Add jobs to the queue
const jobId = await queueManager.addJob({ 
  type: 'process-data',
  payload: { /* data to process */ }
});

// Mark a job as completed (typically from a webhook)
queueManager.completeJob(jobId);

// Mark a job as failed
queueManager.failJob(jobId, new Error('Processing failed'));
```

## API Integration with Express

### Create API Routes

```typescript
import express from 'express';
import { QueueManager, createQueueApiRoutes } from 'turntable-queue';

const app = express();
app.use(express.json());

const queueManager = new QueueManager({
  queueCount: 3,
  timeoutMs: 30000,
  concurrencyPerQueue: 2
});

// Create and mount API routes
const queueRoutes = createQueueApiRoutes(queueManager, {
  // Optional configuration
  transformJobData: (data) => ({
    ...data,
    queuedAt: new Date().toISOString()
  }),
  validateWebhook: (req) => {
    // Validate webhook requests
    return true; // Implement your validation logic
  }
});

// Mount routes at /api/queue
app.use('/api/queue', queueRoutes);

// This creates the following endpoints:
// - POST /api/queue/jobs - Add a job to the queue
// - POST /api/queue/webhook - Handle webhooks
// - GET /api/queue/jobs/status - Get queue stats
```

### Using in Your API

```typescript
// Example API endpoint that adds jobs to the queue
app.post('/api/process-something', async (req, res) => {
  try {
    const { data } = req.body;
    
    // Add to queue instead of processing immediately
    const jobId = await queueManager.addJob({ 
      type: 'process-data',
      payload: data,
      requestedAt: new Date().toISOString(),
    });
    
    // Return job ID to client
    return res.json({
      success: true,
      jobId,
      message: 'Request queued for processing',
    });
    
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
});
```

## Webhook Handling

When an external service completes processing, it can call back to your webhook endpoint:

```
POST /api/queue/webhook
{
  "jobId": "job-123",
  "status": "success", // or "failed"
  "data": { /* result data */ },
  "error": "Error message if failed"
}
```

## Complete Webhook System Example

This package includes a complete webhook-based processing system example that demonstrates:

1. An API server that receives requests and adds them to the queue
2. A task connector that forwards queued jobs to an external service
3. An external service simulator that processes jobs and returns results via webhook
4. Automatic job timeout handling if no webhook is received

### Running the Webhook System Example

To run the complete webhook system:

```bash
# Install dependencies
npm install

# Run the webhook system
npm run webhook-system
```

This will start:
- API server on port 3000
- External service simulator on port 3001

### Webhook System Flow

```
                   ┌─────────────────┐
                   │                 │
 ┌─────────┐       │  Queue System   │       ┌─────────────────┐
 │         │       │                 │       │                 │
 │  API    │──────▶│  QueueManager   │──────▶│ Task Connector  │
 │ Request │       │                 │       │                 │
 └─────────┘       │  (Multiple      │       └────────┬────────┘
                   │   threads)      │                │
                   │                 │                │
                   └─────────────────┘                │
                            ▲                         │
                            │                         │
                            │                         ▼
                   ┌─────────────────┐       ┌─────────────────┐
                   │                 │       │                 │
                   │    Webhook     │◀──────│External Service  │
                   │    Handler     │       │                 │
                   │                 │       │                 │
                   └─────────────────┘       └─────────────────┘
```

### Example API Calls

1. Submit a task to the queue:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"payload": {"action": "process-data", "data": {"id": 123}}, "customTimeout": 30000}'
```

2. Check queue status:
```bash
curl http://localhost:3000/api/status
```

## License

MIT 
