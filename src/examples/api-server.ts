import express from 'express';
import { createQueueApiRoutes } from '../lib/ApiIntegration';
import { QueueManager } from '../core/QueueManager';
import { createTaskConnector } from './task-connector';

// Create Express app
const app = express();
app.use(express.json());

// Initialize the Queue Manager with desired settings
const queueManager = new QueueManager({
  queueCount: 3,               // Number of parallel queues (threads)
  timeoutMs: 60000,            // Default timeout (60 seconds)
  concurrencyPerQueue: 1,      // Each queue can process 2 jobs at once
});

// Helper function to draw queue visualization
function visualizeQueues() {
  const stats = queueManager.getStats();
  const output: string[] = [];
  
  // Add header
  output.push('\n┌────────────────────── QUEUE STATUS ──────────────────────┐');
  
  // Add each queue
  stats.forEach((queue, index) => {
    const queueId = `Thread #${queue.queueId}`;
    const status = queue.isActive ? 'ACTIVE' : 'PAUSED';
    
    // Create visualization of running jobs
    const runningJobs = '🟢'.repeat(queue.running) + '⚪'.repeat(queue.maxConcurrency - queue.running);
    
    // Create visualization of pending jobs
    const pendingCount = queue.length;
    const pendingJobs = pendingCount > 0 ? 
      '🟠'.repeat(Math.min(pendingCount, 5)) + (pendingCount > 5 ? `+${pendingCount-5}` : '') : 
      '⚪';
    
    // Add the queue line
    output.push(`│ ${queueId.padEnd(10)} │ ${status.padEnd(6)} │ Running: ${runningJobs.padEnd(12)} │ Pending: ${pendingJobs.padEnd(12)} │`);
  });
  
  // Add total stats
  const totalRunning = stats.reduce((sum, q) => sum + q.running, 0);
  const totalPending = stats.reduce((sum, q) => sum + q.length, 0);
  const totalMaxConcurrent = stats.reduce((sum, q) => sum + q.maxConcurrency, 0);
  const utilization = totalMaxConcurrent > 0 ? (totalRunning / totalMaxConcurrent * 100).toFixed(1) : '0.0';
  
  output.push('├─────────────────────────────────────────────────────────────┤');
  output.push(`│ TOTALS: ${totalRunning}/${totalMaxConcurrent} jobs running | ${totalPending} jobs pending | ${utilization}% utilization │`);
  output.push('└─────────────────────────────────────────────────────────────┘');
  
  return output.join('\n');
}

// Set up event listeners for essential job lifecycle events
queueManager.on('job:started', (data) => {
  console.log(`[QUEUE] Job ${data.id} started in thread #${data.queueIndex}`);
  console.log(`[QUEUE] Job data: ${JSON.stringify(data.data, null, 2).substring(0, 200)}${JSON.stringify(data.data).length > 200 ? '...' : ''}`);
  console.log(visualizeQueues());
});

queueManager.on('job:completed', (data) => {
  console.log(`[QUEUE] Job ${data.id} completed in ${(data.completedAt! - data.startedAt!) / 1000}s`);
  console.log(visualizeQueues());
});

queueManager.on('job:failed', (data) => {
  console.log(`[QUEUE] Job ${data.id} failed: ${data.error?.message || 'Unknown error'}`);
  console.log(visualizeQueues());
});

queueManager.on('job:timeout', (data) => {
  console.log(`[QUEUE] Job ${data.id} timed out after ${data.timeoutMs! / 1000}s`);
  console.log(visualizeQueues());
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
  // Validate incoming webhooks
  validateWebhook: (req) => {
    const body = req.body;
    return body && body.jobId && typeof body.status !== 'undefined';
  }
});

// Mount the queue API routes
app.use('/api/queue', queueRoutes);

// Initialize the task connector that sends jobs to the external service
const taskConnector = createTaskConnector(queueManager, 'http://localhost:3001/process');

// API endpoint for processing tasks asynchronously
app.post('/api/tasks', async (req, res) => {
  try {
    const { payload, priority, customTimeout } = req.body;
    
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    
    console.log(`[API] Received task request: ${JSON.stringify(payload).substring(0, 100)}${JSON.stringify(payload).length > 100 ? '...' : ''}`);
    
    // Create the job data with all needed information
    const jobData = {
      type: 'task-processing',
      payload,
      priority: priority || 'normal',
      createdAt: new Date().toISOString(),
      timeoutMs: customTimeout
    };
    
    // Show queue before adding job
    console.log('[API] Queue status before adding job:');
    console.log(visualizeQueues());
    
    // Add job to queue system
    const jobId = await queueManager.addJob(jobData);
    
    console.log(`[API] Added task to queue with job ID: ${jobId}`);
    
    // Show queue after adding job
    console.log('[API] Queue status after adding job:');
    console.log(visualizeQueues());
    
    // Return immediately with job ID
    return res.status(202).json({
      success: true,
      message: 'Task accepted for processing',
      jobId,
      estimatedProcessingTime: `${(customTimeout || 60000) / 1000} seconds`
    });
    
  } catch (error) {
    console.error('[API] Error processing task request:', error);
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
    console.log('[API] Task connector started');
    console.log(visualizeQueues());
    res.json({ status: 'running', message: 'Task connector started' });
  } else {
    taskConnector.pause();
    console.log('[API] Task connector paused');
    console.log(visualizeQueues());
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
    const utilization = totalCapacity > 0 ? (totalRunning / totalCapacity * 100) : 0;
    
    console.log('[API] Queue status requested:');
    console.log(visualizeQueues());
    
    return res.json({
      success: true,
      stats,
      summary: {
        queues: stats.length,
        running: totalRunning,
        pending: totalPending,
        capacity: totalCapacity,
        utilizationPercent: utilization
      },
      connector: {
        status: taskConnector.isRunning ? 'running' : 'paused',
        externalServiceUrl: taskConnector.externalServiceUrl
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Error getting status:', error);
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
✅ Queue API Server running on port ${PORT}
   - ${queueManager.getStats().length} threads × ${queueManager.getStats()[0].maxConcurrency} concurrent jobs = ${queueManager.getStats().length * queueManager.getStats()[0].maxConcurrency} capacity
   - Default timeout: ${60000 / 1000}s
   - External service: ${taskConnector.externalServiceUrl}
  `);
  console.log(visualizeQueues());
}); 