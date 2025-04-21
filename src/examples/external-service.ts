import express from 'express';
import axios from 'axios';

// Create Express app for the external service
const app = express();
app.use(express.json());

// Store active jobs
const activeJobs = new Map<string, any>();

// Configure external service settings
const CONFIG = {
  // Where to send webhook callbacks
  webhookUrl: 'http://localhost:3000/api/queue/webhook',
  
  // Simulation parameters
  simulationSettings: {
    // Min/max processing time in ms
    minProcessingTime: 3000, // 3 seconds
    maxProcessingTime: 15000, // 15 seconds
    
    // Success rate (0-1)
    successRate: 0.8, // 80% success rate
    
    // Rate of tasks that will just never respond (0-1)
    noResponseRate: 0.1, // 10% of tasks will not respond at all
  }
};

// Helper function to visualize active jobs
function visualizeActiveJobs() {
  const jobs = Array.from(activeJobs.entries());
  const output: string[] = [];
  
  if (jobs.length === 0) {
    return '\n[EXTERNAL] No active jobs being processed';
  }
  
  output.push('\n┌──────────────────── ACTIVE JOBS PROCESSING ────────────────────┐');
  
  jobs.forEach(([jobId, job]) => {
    const shortId = jobId.substring(0, 8);
    const elapsedTime = Date.now() - new Date(job.receivedAt).getTime();
    const elapsedTimeStr = `${(elapsedTime / 1000).toFixed(1)}s`;
    
    let jobType = 'unknown';
    if (job.payload && job.payload.type) {
      jobType = job.payload.type;
    } else if (job.payload && job.payload.action) {
      jobType = job.payload.action;
    }
    
    let progressBar = '';
    if (job.expectedDuration) {
      const progress = Math.min(elapsedTime / job.expectedDuration, 1);
      const barLength = 20;
      const filledLength = Math.floor(progress * barLength);
      progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
      progressBar += ` ${(progress * 100).toFixed(0)}%`;
    } else {
      progressBar = '⏳ Processing...';
    }
    
    output.push(`│ Job: ${shortId.padEnd(10)} │ Type: ${jobType.padEnd(15)} │ Time: ${elapsedTimeStr.padEnd(6)} │ ${progressBar.padEnd(25)} │`);
  });
  
  output.push('└─────────────────────────────────────────────────────────────────┘');
  
  return output.join('\n');
}

// Endpoint to receive task processing requests
app.post('/process', (req, res) => {
  const { jobId, payload } = req.body;
  
  if (!jobId || !payload) {
    return res.status(400).json({ error: 'Missing jobId or payload' });
  }
  
  console.log(`[EXTERNAL] Received job ${jobId} for processing`);
  console.log(`[EXTERNAL] Payload: ${JSON.stringify(payload, null, 2).substring(0, 200)}${JSON.stringify(payload).length > 200 ? '...' : ''}`);
  
  // Generate a random processing time
  const processingTime = Math.floor(
    Math.random() * 
    (CONFIG.simulationSettings.maxProcessingTime - CONFIG.simulationSettings.minProcessingTime) + 
    CONFIG.simulationSettings.minProcessingTime
  );
  
  // Store job in active jobs
  activeJobs.set(jobId, {
    jobId,
    payload,
    receivedAt: new Date().toISOString(),
    expectedDuration: processingTime
  });
  
  // Show active jobs after adding
  console.log(visualizeActiveJobs());
  
  // Immediately acknowledge receipt
  res.status(202).json({
    success: true,
    message: 'Task received for processing',
    jobId,
    estimatedCompletionTime: `Processing time varies between 3-15 seconds`,
  });
  
  // Start processing
  processJobAsync(jobId, payload);
});

// Asynchronously process a job and send webhook when done
async function processJobAsync(jobId: string, payload: any) {
  // Determine if this task will never respond (simulates lost tasks)
  const willRespond = Math.random() > CONFIG.simulationSettings.noResponseRate;
  
  if (!willRespond) {
    console.log(`[EXTERNAL] Job ${jobId} will not respond (simulating lost task)`);
    return; // Don't process, don't respond
  }
  
  // Get the expected processing time from the stored job
  const processingTime = activeJobs.get(jobId)?.expectedDuration || 
    Math.floor(
      Math.random() * 
      (CONFIG.simulationSettings.maxProcessingTime - CONFIG.simulationSettings.minProcessingTime) + 
      CONFIG.simulationSettings.minProcessingTime
    );
  
  console.log(`[EXTERNAL] Processing job ${jobId} (${processingTime/1000}s)`);
  
  // Display processing updates at intervals
  const updateInterval = setInterval(() => {
    if (activeJobs.has(jobId)) {
      console.log(visualizeActiveJobs());
    } else {
      clearInterval(updateInterval);
    }
  }, 2000);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Clear the update interval
  clearInterval(updateInterval);
  
  // Determine success/failure based on success rate
  const isSuccess = Math.random() <= CONFIG.simulationSettings.successRate;
  
  // Create response data
  const responseData = isSuccess 
    ? { 
        result: 'processed',
        processingTime,
        output: `Successfully processed task: ${payload.type || 'unknown'}`
      }
    : null;
  
  // Create error if failed
  const error = !isSuccess 
    ? `Failed to process task: ${payload.type || 'unknown'} - ${getRandomError()}` 
    : undefined;
  
  // Send webhook callback
  try {
    await axios.post(CONFIG.webhookUrl, {
      jobId,
      status: isSuccess ? 'success' : 'failed',
      data: responseData,
      error
    });
    
    console.log(`[EXTERNAL] Sent ${isSuccess ? 'success' : 'failure'} webhook for job ${jobId}`);
    
    // Remove from active jobs
    activeJobs.delete(jobId);
    
    // Show remaining active jobs
    if (activeJobs.size > 0) {
      console.log(visualizeActiveJobs());
    } else {
      console.log('[EXTERNAL] No more active jobs');
    }
    
  } catch (err) {
    console.error(`[EXTERNAL] Failed to send webhook for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Generate a random error message
function getRandomError(): string {
  const errors = [
    'Connection timeout',
    'Internal server error',
    'Resource not found',
    'Invalid input parameters',
    'Service temporarily unavailable',
    'Processing limit exceeded',
    'Dependency failure',
    'Authentication failed'
  ];
  
  return errors[Math.floor(Math.random() * errors.length)];
}

// Endpoint to manually trigger a response for a specific job
app.post('/manual-response/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { success = true } = req.body;
  
  if (!activeJobs.has(jobId)) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }
  
  // Send webhook callback
  axios.post(CONFIG.webhookUrl, {
    jobId,
    status: success ? 'success' : 'failed',
    data: success ? { result: 'manually triggered', timestamp: new Date().toISOString() } : null,
    error: !success ? 'Manually triggered failure' : undefined
  })
  .then(() => {
    console.log(`[EXTERNAL] Sent manual ${success ? 'success' : 'failure'} webhook for job ${jobId}`);
    activeJobs.delete(jobId);
    
    // Show remaining active jobs
    if (activeJobs.size > 0) {
      console.log(visualizeActiveJobs());
    } else {
      console.log('[EXTERNAL] No more active jobs');
    }
  })
  .catch(err => {
    console.error(`[EXTERNAL] Failed to send manual webhook for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`);
  });
  
  return res.json({
    success: true,
    message: `Manually triggered ${success ? 'success' : 'failure'} response for job ${jobId}`,
  });
});

// Endpoint to list all active jobs
app.get('/active-jobs', (req, res) => {
  const jobs = Array.from(activeJobs.values());
  
  console.log(`[EXTERNAL] Active jobs requested (${jobs.length} jobs)`);
  if (jobs.length > 0) {
    console.log(visualizeActiveJobs());
  }
  
  return res.json({
    count: jobs.length,
    jobs
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[EXTERNAL] Service running on port ${PORT}`);
  console.log(`[EXTERNAL] Settings: ${CONFIG.simulationSettings.successRate * 100}% success rate, ${CONFIG.simulationSettings.noResponseRate * 100}% no-response rate`);
  console.log(`[EXTERNAL] Processing time: ${CONFIG.simulationSettings.minProcessingTime/1000}s - ${CONFIG.simulationSettings.maxProcessingTime/1000}s`);
}); 