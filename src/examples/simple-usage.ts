import { PrismaClient } from '@prisma/client';
import { PersistentQueueManager } from '../core/PersistentQueueManager';
import express from 'express';

async function startServer() {
  // Step 1: Create a Prisma client (optional - the manager can create one for you)
  const prisma = new PrismaClient();
  
  // Step 2: Create the PersistentQueueManager
  const queueManager = new PersistentQueueManager({
    queueCount: 2,                         // Number of parallel queues/threads
    concurrencyPerQueue: 2,                // Each queue can process 2 jobs concurrently
    timeoutMs: 30000,                      // Default job timeout (30 seconds)
    prismaClient: prisma,                  // Optional: Pass your own Prisma client
    autoCleanupDays: 7,                    // Auto cleanup completed jobs older than 7 days
  });

  // Step 3: Set up event listeners (optional)
  queueManager.on('job:completed', (data) => {
    console.log(`Job ${data.id} completed successfully!`);
  });

  queueManager.on('job:failed', (data) => {
    console.error(`Job ${data.id} failed: ${data.error?.message}`);
  });

  // Step 4: Create your Express app and add job processing endpoints
  const app = express();
  app.use(express.json());

  // Add a job to the queue
  app.post('/process', async (req, res) => {
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
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await queueManager.shutdown();
    process.exit(0);
  });
}

startServer().catch(console.error); 