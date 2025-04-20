import express from 'express';
import { QueueManager, createQueueApiRoutes } from '../';
import axios from 'axios';

// Create Express app
const app = express();
app.use(express.json());

// Initialize the Queue Manager
const queueManager = new QueueManager({
  queueCount: 3,
  timeoutMs: 30000, // 30 seconds
  concurrencyPerQueue: 2, // Each queue can process 2 jobs at once
});

// Listen to queue events
queueManager.on('job:started', (data) => {
  console.log(`🚀 Job started: ${data.id} in queue #${data.queueIndex}`);
});

queueManager.on('job:completed', (data) => {
  console.log(`✅ Job completed: ${data.id} in queue #${data.queueIndex}`);
});

queueManager.on('job:failed', (data) => {
  console.log(`❌ Job failed: ${data.id} in queue #${data.queueIndex}`);
  console.log(`   Error: ${data.error?.message}`);
});

queueManager.on('job:timeout', (data) => {
  console.log(`⏱️ Job timed out: ${data.id} in queue #${data.queueIndex}`);
});

// Create API routes
const queueRoutes = createQueueApiRoutes(queueManager, {
  // Optional custom transformation of job data
  transformJobData: (data) => {
    // Add a timestamp to the job data
    return {
      ...data,
      queuedAt: new Date().toISOString(),
    };
  },
  // Optional webhook validation
  validateWebhook: (req) => {
    // In a real app, you would validate the webhook signature
    // For demo purposes, we're just checking if the request has required fields
    const body = req.body;
    return body && body.jobId && body.status !== undefined;
  }
});

// Mount the queue routes
app.use('/api/queue', queueRoutes);

// Create a demo API endpoint that adds jobs to the queue
app.post('/api/process-something', async (req, res) => {
  try {
    // This would be your API endpoint that receives requests
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }
    
    // Add to queue instead of processing immediately
    const jobId = await queueManager.addJob({ 
      type: 'process-data',
      payload: data,
      requestedAt: new Date().toISOString(),
    });
    
    // In a real app, you might store the jobId in a database
    console.log(`Added job ${jobId} to queue`);
    
    return res.json({
      success: true,
      jobId,
      message: 'Request queued for processing',
    });
    
  } catch (error) {
    console.error('Error queuing job:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Simulate a webhook endpoint from an external service
app.post('/external-service-callback', (req, res) => {
  const { jobId, success, data, error } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId' });
  }
  
  // Send back to our webhook handler
  setTimeout(async () => {
    try {
      await axios.post('http://localhost:3000/api/queue/webhook', {
        jobId,
        status: success ? 'success' : 'failed',
        data,
        error,
      });
      console.log(`Sent webhook callback for job ${jobId}`);
    } catch (err) {
      console.error('Error sending webhook callback:', err);
    }
  }, 1000); // Simulate delay
  
  return res.json({ received: true });
});

// Add a demo endpoint to see all queues
app.get('/api/queue-status', (req, res) => {
  const stats = queueManager.getStats();
  res.json({ stats });
});

// Add a demo endpoint to simulate job completion
app.post('/api/simulate-completion/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { success = true } = req.body;
  
  if (success) {
    queueManager.completeJob(jobId);
    res.json({ message: `Job ${jobId} marked as completed` });
  } else {
    queueManager.failJob(jobId, new Error('Simulated failure'));
    res.json({ message: `Job ${jobId} marked as failed` });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
🚀 Queue System API Server running on port ${PORT}

Available endpoints:
- POST /api/process-something           - Add a job to the queue
- POST /external-service-callback       - Simulate external service callback
- GET  /api/queue-status                - View queue stats
- POST /api/simulate-completion/:jobId  - Manually complete a job

Queue API endpoints:
- POST /api/queue/jobs                  - Add a job directly to the queue
- POST /api/queue/webhook               - Webhook handler
- GET  /api/queue/jobs/status           - View queue stats

Example curl commands:

1. Add a job to the queue:
curl -X POST http://localhost:${PORT}/api/process-something \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"message": "Hello, World!"}}'

2. Simulate a webhook callback:
curl -X POST http://localhost:${PORT}/external-service-callback \\
  -H "Content-Type: application/json" \\
  -d '{"jobId": "<JOB_ID>", "success": true, "data": {"result": "success"}}'

3. Check queue status:
curl http://localhost:${PORT}/api/queue-status

4. Manually complete a job:
curl -X POST http://localhost:${PORT}/api/simulate-completion/<JOB_ID> \\
  -H "Content-Type: application/json" \\
  -d '{"success": true}'
`);
}); 