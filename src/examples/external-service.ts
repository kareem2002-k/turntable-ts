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

// Endpoint to receive task processing requests
app.post('/process', (req, res) => {
  const { jobId, payload } = req.body;
  
  if (!jobId || !payload) {
    return res.status(400).json({ error: 'Missing jobId or payload' });
  }
  
  console.log(`📥 EXTERNAL SERVICE: Received job ${jobId} for processing`);
  console.log(`   Payload: ${JSON.stringify(payload)}`);
  
  // Store job in active jobs
  activeJobs.set(jobId, {
    jobId,
    payload,
    receivedAt: new Date().toISOString(),
  });
  
  // Immediately acknowledge receipt
  res.status(202).json({
    success: true,
    message: 'Task received for processing',
    jobId,
    estimatedCompletionTime: 'Processing time varies between 3-15 seconds',
  });
  
  // Start processing
  processJobAsync(jobId, payload);
});

// Asynchronously process a job and send webhook when done
async function processJobAsync(jobId: string, payload: any) {
  // Determine if this task will never respond (simulates lost tasks)
  const willRespond = Math.random() > CONFIG.simulationSettings.noResponseRate;
  
  if (!willRespond) {
    console.log(`🤷‍♂️ EXTERNAL SERVICE: Job ${jobId} will not respond (simulating lost task)`);
    return; // Don't process, don't respond
  }
  
  // Generate a random processing time
  const processingTime = Math.floor(
    Math.random() * 
    (CONFIG.simulationSettings.maxProcessingTime - CONFIG.simulationSettings.minProcessingTime) + 
    CONFIG.simulationSettings.minProcessingTime
  );
  
  console.log(`⏳ EXTERNAL SERVICE: Processing job ${jobId} (will take ${processingTime/1000}s)`);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
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
    
    console.log(`✉️ EXTERNAL SERVICE: Sent ${isSuccess ? 'success' : 'failure'} webhook for job ${jobId}`);
    
    // Remove from active jobs
    activeJobs.delete(jobId);
    
  } catch (err) {
    console.error(`❌ EXTERNAL SERVICE: Failed to send webhook for job ${jobId}:`, err);
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
  
  const job = activeJobs.get(jobId);
  
  // Send webhook callback
  axios.post(CONFIG.webhookUrl, {
    jobId,
    status: success ? 'success' : 'failed',
    data: success ? { result: 'manually triggered', timestamp: new Date().toISOString() } : null,
    error: !success ? 'Manually triggered failure' : undefined
  })
  .then(() => {
    console.log(`✉️ EXTERNAL SERVICE: Sent manually triggered ${success ? 'success' : 'failure'} webhook for job ${jobId}`);
    activeJobs.delete(jobId);
  })
  .catch(err => {
    console.error(`❌ EXTERNAL SERVICE: Failed to send manual webhook for job ${jobId}:`, err);
  });
  
  return res.json({
    success: true,
    message: `Manually triggered ${success ? 'success' : 'failure'} response for job ${jobId}`,
  });
});

// Endpoint to list all active jobs
app.get('/active-jobs', (req, res) => {
  const jobs = Array.from(activeJobs.values());
  return res.json({
    count: jobs.length,
    jobs
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
🔄 External Service Simulator running on port ${PORT}

This service simulates an external system that:
1. Receives tasks from the queue API
2. Processes them asynchronously (3-15 seconds)
3. Sends webhook callbacks when done

Configuration:
- Success rate: ${CONFIG.simulationSettings.successRate * 100}%
- Tasks with no response: ${CONFIG.simulationSettings.noResponseRate * 100}%
- Processing time: ${CONFIG.simulationSettings.minProcessingTime/1000}-${CONFIG.simulationSettings.maxProcessingTime/1000} seconds
- Webhook URL: ${CONFIG.webhookUrl}

Available endpoints:
- POST /process                      - Receive tasks for processing
- GET  /active-jobs                  - List all active jobs
- POST /manual-response/:jobId       - Manually trigger response for a job

Example curl commands:

1. Send a job for processing:
curl -X POST http://localhost:${PORT}/process \\
  -H "Content-Type: application/json" \\
  -d '{"jobId": "test-job-123", "payload": {"type": "image-processing", "data": {"url": "example.com/image.jpg"}}}'

2. List active jobs:
curl http://localhost:${PORT}/active-jobs

3. Manually trigger response:
curl -X POST http://localhost:${PORT}/manual-response/test-job-123 \\
  -H "Content-Type: application/json" \\
  -d '{"success": true}'
`);
}); 