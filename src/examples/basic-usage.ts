import { QueueManager } from '../core/QueueManager';
import express from 'express';

async function startBasicServer() {
  // Create a basic QueueManager without persistence
  const queueManager = new QueueManager({
    queueCount: 2,                      // Number of parallel queues/threads
    concurrencyPerQueue: 2,             // Each queue can process 2 jobs concurrently
    timeoutMs: 30000,                   // Default job timeout (30 seconds)
    persistence: false                  // Disable persistence - in-memory only
  });

  // Set up event listeners
  queueManager.on('job:started', (data) => {
    console.log(`Job ${data.id} started in queue #${data.queueIndex}`);
  });

  queueManager.on('job:completed', (data) => {
    console.log(`Job ${data.id} completed successfully!`);
  });

  queueManager.on('job:failed', (data) => {
    console.error(`Job ${data.id} failed: ${data.error?.message}`);
  });

  // Create an Express app
  const app = express();
  app.use(express.json());

  // Add a job to the queue
  app.post('/jobs', async (req, res) => {
    try {
      const { data } = req.body;
      
      // Add to queue
      const jobId = await queueManager.addJob(data);
      
      res.status(202).json({
        success: true,
        jobId,
        message: 'Job added to queue'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Mark a job as complete (e.g., from a webhook)
  app.post('/jobs/:id/complete', (req, res) => {
    const { id } = req.params;
    queueManager.completeJob(id);
    res.json({ success: true });
  });

  // Mark a job as failed
  app.post('/jobs/:id/fail', (req, res) => {
    const { id } = req.params;
    const { error } = req.body;
    queueManager.failJob(id, error ? new Error(error) : undefined);
    res.json({ success: true });
  });

  // Get queue stats
  app.get('/stats', (req, res) => {
    const stats = queueManager.getStats();
    res.json({ stats });
  });

  // Start the server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Queue capacity: ${queueManager.getStats().length * queueManager.getStats()[0].maxConcurrency}`);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    queueManager.shutdownAllQueues();
    process.exit(0);
  });
}

// Only run if this file is executed directly
if (require.main === module) {
  startBasicServer().catch(console.error);
}

export { startBasicServer }; 