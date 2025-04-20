import express from 'express';
import { QueueManager, createQueueApiRoutes } from '../';
import { createTaskConnector } from './task-connector';

// Create Express app
const app = express();
app.use(express.json());

// Initialize the Queue Manager with desired settings
const queueManager = new QueueManager({
  queueCount: 3,               // Number of parallel queues (threads)
  timeoutMs: 60000,            // Default timeout (60 seconds)
  concurrencyPerQueue: 2,      // Each queue can process 2 jobs at once
});

// Set up event listeners for tracking job lifecycle
queueManager.on('job:started', (data) => {
  console.log(`🚀 Job started: ${data.id} in queue #${data.queueIndex}`);
  console.log(`   Job data: ${JSON.stringify(data.data)}`);
});

queueManager.on('job:completed', (data) => {
  console.log(`✅ Job completed: ${data.id} in queue #${data.queueIndex}`);
  console.log(`   Processing time: ${(data.completedAt! - data.startedAt!) / 1000} seconds`);
});

queueManager.on('job:failed', (data) => {
  console.log(`❌ Job failed: ${data.id} in queue #${data.queueIndex}`);
  console.log(`   Error: ${data.error?.message}`);
});

queueManager.on('job:timeout', (data) => {
  console.log(`⏱️ Job timed out: ${data.id} in queue #${data.queueIndex}`);
  console.log(`   Timeout after: ${data.timeoutMs! / 1000} seconds`);
});

// Create and configure API routes
const queueRoutes = createQueueApiRoutes(queueManager, {
  // Transform job data to include metadata
  transformJobData: (data) => {
    return {
      ...data,
      queuedAt: new Date().toISOString(),
      metadata: {
        source: 'api-request',
        version: '1.0'
      }
    };
  },
  // Validate incoming webhooks (basic example)
  validateWebhook: (req) => {
    // In a real app, you would validate signatures, tokens, etc.
    const body = req.body;
    return body && body.jobId && typeof body.status !== 'undefined';
  }
});

// Mount the queue API routes
app.use('/api/queue', queueRoutes);

// Initialize the task connector that sends jobs to the external service
// This connects the queue system to the external service
const taskConnector = createTaskConnector(queueManager, 'http://localhost:3001/process');

// API endpoint for processing tasks asynchronously
app.post('/api/tasks', async (req, res) => {
  try {
    const { payload, priority, customTimeout } = req.body;
    
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    
    // Add job to queue system with optional custom timeout
    const jobId = await queueManager.addJob({
      type: 'task-processing',
      payload,
      priority: priority || 'normal',
      createdAt: new Date().toISOString()
    }, customTimeout);
    
    // Return immediately with job ID
    return res.status(202).json({
      success: true,
      message: 'Task accepted for processing',
      jobId,
      estimatedProcessingTime: `${(customTimeout || 60000) / 1000} seconds`
    });
    
  } catch (error) {
    console.error('Error processing task request:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Endpoint to toggle the task connector
app.post('/api/connector/toggle', (req, res) => {
  const { enable } = req.body;
  
  if (enable) {
    taskConnector.start();
    res.json({ status: 'running', message: 'Task connector started' });
  } else {
    taskConnector.pause();
    res.json({ status: 'paused', message: 'Task connector paused' });
  }
});

// Endpoint to retrieve current queue status
app.get('/api/status', (req, res) => {
  try {
    const stats = queueManager.getStats();
    
    // Calculate totals
    const totalRunning = stats.reduce((sum, q) => sum + q.running, 0);
    const totalPending = stats.reduce((sum, q) => sum + q.length, 0);
    const totalCapacity = stats.reduce((sum, q) => sum + q.maxConcurrency, 0);
    
    return res.json({
      success: true,
      stats,
      summary: {
        queues: stats.length,
        running: totalRunning,
        pending: totalPending,
        capacity: totalCapacity,
        utilizationPercent: totalCapacity > 0 ? (totalRunning / totalCapacity) * 100 : 0
      },
      connector: {
        status: taskConnector.isRunning ? 'running' : 'paused',
        externalServiceUrl: taskConnector.externalServiceUrl
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
✅ Task Queue API Server running on port ${PORT}

Available endpoints:
- POST /api/tasks                - Submit a new task for processing
- GET  /api/status               - View queue status and statistics
- POST /api/connector/toggle     - Enable/disable the task connector
- POST /api/queue/jobs           - Alternative endpoint to add jobs directly 
- POST /api/queue/webhook        - Webhook endpoint for external services to report completion

Current configuration:
- ${queueManager.getStats().length} parallel queues (threads)
- ${queueManager.getStats()[0].maxConcurrency} concurrent jobs per queue
- ${queueManager.getStats().length * queueManager.getStats()[0].maxConcurrency} total concurrent capacity
- Default timeout: ${60000 / 1000} seconds

Example curl commands:

1. Submit a task:
curl -X POST http://localhost:${PORT}/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"payload": {"action": "process-data", "data": {"id": 123}}, "customTimeout": 30000}'

2. Check queue status:
curl http://localhost:${PORT}/api/status

3. Toggle the connector:
curl -X POST http://localhost:${PORT}/api/connector/toggle \\
  -H "Content-Type: application/json" \\
  -d '{"enable": false}'
`);
}); 