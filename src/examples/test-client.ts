import axios from 'axios';
import { v4 as uuid } from 'uuid';

// Configuration for the test client
const CONFIG = {
  // API server URL
  apiServerUrl: 'http://localhost:3000',
  
  // Interval between requests (ms)
  requestInterval: 2000,
  
  // Total number of test requests to send
  totalRequestsToSend: 20,
  
  // Whether to send requests automatically
  autoSendRequests: true,
  
  // Percentages for different types of requests (should sum to 1)
  requestTypes: {
    fastRequests: 0.4,    // Requests that should complete quickly
    slowRequests: 0.3,    // Requests that will take longer
    errorRequests: 0.3,   // Requests that should trigger errors
  }
};

// Tracking state
const stats = {
  requestsSent: 0,
  completed: 0,
  failed: 0,
  pending: 0
};

// Store job IDs and their types for tracking
const jobTracker = new Map<string, { 
  type: string,
  sentAt: number,
  status?: 'completed' | 'failed' | 'pending'
}>();

/**
 * Helper function to visualize test progress
 */
function visualizeTestProgress() {
  const output: string[] = [];
  
  // Calculate percentages for the progress bar
  const totalJobs = stats.requestsSent;
  const completedPercent = totalJobs > 0 ? (stats.completed / totalJobs) * 100 : 0;
  const failedPercent = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;
  const pendingPercent = totalJobs > 0 ? (stats.pending / totalJobs) * 100 : 0;
  
  // Progress bar width
  const barWidth = 50;
  const completedWidth = Math.floor((completedPercent / 100) * barWidth);
  const failedWidth = Math.floor((failedPercent / 100) * barWidth);
  const pendingWidth = Math.floor((pendingPercent / 100) * barWidth);
  
  // Build progress bar
  const progressBar = 
    '█'.repeat(completedWidth) +
    '▓'.repeat(pendingWidth) +
    '▒'.repeat(failedWidth) +
    '░'.repeat(Math.max(0, barWidth - completedWidth - pendingWidth - failedWidth));
  
  // Add header
  output.push('\n┌──────────────────── TEST PROGRESS ─────────────────────┐');
  
  // Add progress bar
  output.push(`│ Progress: ${progressBar} │`);
  output.push(`│ Sent: ${stats.requestsSent}/${CONFIG.totalRequestsToSend} | Complete: ${stats.completed} | Pending: ${stats.pending} | Failed: ${stats.failed} │`);
  
  // Calculate summary for each type of request
  const requestTypes = Object.keys(CONFIG.requestTypes);
  const typeCounts: Record<string, { total: number, completed: number, failed: number, pending: number }> = {};
  
  requestTypes.forEach(type => {
    typeCounts[type] = { total: 0, completed: 0, failed: 0, pending: 0 };
  });
  
  // Count jobs by type
  for (const [_, job] of jobTracker.entries()) {
    const typeKey = job.type.includes('fast') ? 'fastRequests' :
                    job.type.includes('slow') ? 'slowRequests' : 
                    'errorRequests';
                    
    typeCounts[typeKey].total++;
    
    if (job.status === 'completed') {
      typeCounts[typeKey].completed++;
    } else if (job.status === 'failed') {
      typeCounts[typeKey].failed++;
    } else {
      typeCounts[typeKey].pending++;
    }
  }
  
  // Add detail lines
  output.push('├──────────────────────────────────────────────────────────┤');
  output.push('│ Request Type   | Total | Complete | Pending | Failed     │');
  output.push('├──────────────────────────────────────────────────────────┤');
  
  // Add stats for each type
  output.push(`│ Fast Requests  | ${typeCounts.fastRequests.total.toString().padEnd(5)} | ${typeCounts.fastRequests.completed.toString().padEnd(8)} | ${typeCounts.fastRequests.pending.toString().padEnd(7)} | ${typeCounts.fastRequests.failed.toString().padEnd(10)} │`);
  output.push(`│ Slow Requests  | ${typeCounts.slowRequests.total.toString().padEnd(5)} | ${typeCounts.slowRequests.completed.toString().padEnd(8)} | ${typeCounts.slowRequests.pending.toString().padEnd(7)} | ${typeCounts.slowRequests.failed.toString().padEnd(10)} │`);
  output.push(`│ Error Requests | ${typeCounts.errorRequests.total.toString().padEnd(5)} | ${typeCounts.errorRequests.completed.toString().padEnd(8)} | ${typeCounts.errorRequests.pending.toString().padEnd(7)} | ${typeCounts.errorRequests.failed.toString().padEnd(10)} │`);
  
  // Add completion estimate if we have data
  if (stats.completed > 0 && stats.pending > 0) {
    const avgCompletionTime = Array.from(jobTracker.values())
      .filter(job => job.status === 'completed')
      .reduce((sum, job) => sum + (Date.now() - job.sentAt), 0) / stats.completed;
    
    // Estimate remaining time
    const remainingEstimate = (avgCompletionTime * stats.pending) / 1000;
    output.push('├──────────────────────────────────────────────────────────┤');
    output.push(`│ Estimated completion time: ${remainingEstimate.toFixed(1)}s remaining           │`);
  }
  
  output.push('└──────────────────────────────────────────────────────────┘');
  
  return output.join('\n');
}

/**
 * Generate a random test request
 */
function generateTestRequest() {
  const random = Math.random();
  let requestType: string;
  let payload: any;
  let timeout: number | undefined;
  
  // Determine request type based on configured percentages
  const fastThreshold = CONFIG.requestTypes.fastRequests;
  const slowThreshold = fastThreshold + CONFIG.requestTypes.slowRequests;
  
  if (random < fastThreshold) {
    // Fast request
    requestType = 'fast-processing';
    timeout = 5000; // 5 second timeout
    payload = {
      action: 'process-simple-data',
      data: {
        id: uuid().substring(0, 8),
        type: 'fast',
        items: Math.floor(Math.random() * 10) + 1
      }
    };
  } else if (random < slowThreshold) {
    // Slow request
    requestType = 'slow-processing';
    timeout = 20000; // 20 second timeout
    payload = {
      action: 'process-complex-data',
      data: {
        id: uuid().substring(0, 8),
        type: 'slow',
        complexityFactor: Math.floor(Math.random() * 5) + 5,
        dataSizeKb: Math.floor(Math.random() * 1000) + 500
      }
    };
  } else {
    // Error request (will likely cause an error in processing)
    requestType = 'error-prone';
    timeout = 10000; // 10 second timeout
    payload = {
      action: 'process-invalid-data',
      data: {
        id: uuid().substring(0, 8),
        type: 'error',
        // Missing required fields or invalid data to trigger errors
        invalidField: null,
        shouldFail: true
      }
    };
  }
  
  return {
    type: requestType,
    payload,
    customTimeout: timeout
  };
}

/**
 * Send a test request to the API server
 */
async function sendTestRequest() {
  // Generate a request
  const request = generateTestRequest();
  
  try {
    console.log(`[TEST] Sending ${request.type} request`);
    
    // Send to API server
    const response = await axios.post(`${CONFIG.apiServerUrl}/api/tasks`, request);
    
    // Track the job
    const jobId = response.data.jobId;
    jobTracker.set(jobId, {
      type: request.type,
      sentAt: Date.now(),
      status: 'pending'
    });
    
    // Update stats
    stats.requestsSent++;
    stats.pending++;
    
    console.log(`[TEST] Request sent, job ID: ${jobId}`);
    console.log(visualizeTestProgress());
    
    return jobId;
  } catch (error) {
    console.error(`[TEST] Error sending request:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Check the status of all jobs
 */
async function checkJobsStatus() {
  try {
    console.log(`[TEST] Checking status of ${jobTracker.size} jobs`);
    
    // Get system status from API
    const response = await axios.get(`${CONFIG.apiServerUrl}/api/status`);
    
    // Get active jobs from the external service
    const externalResponse = await axios.get('http://localhost:3001/active-jobs');
    const activeExternalJobs = new Set(externalResponse.data.jobs.map((j: any) => j.jobId));
    
    // Update statistics for display
    stats.completed = 0;
    stats.failed = 0;
    stats.pending = 0;
    
    // Check if any jobs have completed or failed
    for (const [jobId, job] of jobTracker.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        // Already counted
        if (job.status === 'completed') stats.completed++;
        if (job.status === 'failed') stats.failed++;
      } else if (activeExternalJobs.has(jobId)) {
        // Job is actively being processed externally
        stats.pending++;
        job.status = 'pending';
      } else {
        // Check if still in the queue system
        let stillInQueue = false;
        for (const queue of response.data.stats) {
          // Would need deeper inspection to truly identify if job is in queue
          // This is a simplified approach
          if (queue.running > 0 || queue.length > 0) {
            stillInQueue = true;
          }
        }
        
        if (stillInQueue) {
          // Job is still pending
          stats.pending++;
          job.status = 'pending';
        } else {
          // If not in external service and not in queue, we assume it completed or failed
          // In a real system, we would need a way to query job status
          const elapsed = Date.now() - job.sentAt;
          if (elapsed > 30000) {
            // If more than 30 seconds passed, we assume it failed
            job.status = 'failed';
            stats.failed++;
            console.log(`[TEST] Job ${jobId} (${job.type}) assumed failed after ${elapsed/1000}s`);
          } else {
            // Otherwise, assume it completed successfully
            job.status = 'completed';
            stats.completed++;
            console.log(`[TEST] Job ${jobId} (${job.type}) completed in ${elapsed/1000}s`);
          }
        }
      }
    }
    
    // Display test progress visualization
    console.log(visualizeTestProgress());
    
  } catch (error) {
    console.error(`[TEST] Error checking job status:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Start the test system
 */
function startTestSystem() {
  console.log('[TEST] Starting automatic test client');
  console.log(`[TEST] Will send ${CONFIG.totalRequestsToSend} requests at ${CONFIG.requestInterval/1000}s intervals`);
  console.log(`[TEST] Request mix: ${CONFIG.requestTypes.fastRequests * 100}% fast, ${CONFIG.requestTypes.slowRequests * 100}% slow, ${CONFIG.requestTypes.errorRequests * 100}% error-prone`);
  
  // Check the status every 5 seconds
  setInterval(checkJobsStatus, 5000);
  
  if (CONFIG.autoSendRequests) {
    // Start sending requests
    const requestInterval = setInterval(async () => {
      await sendTestRequest();
      
      // Stop after sending the specified number of requests
      if (stats.requestsSent >= CONFIG.totalRequestsToSend) {
        clearInterval(requestInterval);
        console.log('[TEST] Completed sending all test requests');
        console.log(visualizeTestProgress());
        
        // Continue checking status for a while
        setTimeout(() => {
          console.log('[TEST] Final check complete - test client shutting down');
          console.log(visualizeTestProgress());
          process.exit(0);
        }, 30000);
      }
    }, CONFIG.requestInterval);
  }
  
  // Handle termination
  process.on('SIGINT', () => {
    console.log('\n[TEST] Test client shutting down...');
    console.log(visualizeTestProgress());
    process.exit(0);
  });
}

// Start the test system
startTestSystem(); 