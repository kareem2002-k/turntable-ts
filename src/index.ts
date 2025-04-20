// Export main components
export { QueueManager } from './lib/QueueManager';
export { Queue } from './lib/Queue';

// Export types
export * from './lib/types';

// Export API integration helpers
export * from './lib/ApiIntegration';

import { QueueManager } from './core/QueueManager';
import * as readline from 'readline';
import chalk from 'chalk';

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Simulation state
let manager: QueueManager;
const jobIdMap = new Map<string, string>(); // Store job IDs for simulation
let autoGenerateRequests = false; // Flag to control automatic request generation
let autoGenerateInterval: NodeJS.Timeout | null = null; // Store interval for auto generation
let requestIdCounter = 1; // Counter for request IDs
let systemRunning = true; // Flag to indicate if the system is accepting new jobs

// Set up event listeners for queue manager events
function setupManagerEventListeners(): void {
  if (!manager) return;
  
  let batchJobsTotal = 0;
  let batchJobsCompleted = 0;
  let batchJobsFailed = 0;
  let batchInProgress = false;
  
  manager.on('job:queued', (data) => {
    // If job name includes "Batch-", it's a batch job
    if (data.data?.name?.includes('Batch-')) {
      if (!batchInProgress) {
        batchInProgress = true;
        batchJobsTotal = 0;
        batchJobsCompleted = 0;
        batchJobsFailed = 0;
      }
      
      batchJobsTotal++;
    }
  });
  
  // Listen for job lifecycle events
  manager.on('job:started', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.magenta(`\n⚡ THREAD #${data.queueIndex} ACTIVATED: Started processing job: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Started at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray(`   Expected timeout: ${data.timeoutMs / 1000} seconds if no response`));
    
    // Display system status banner showing accepting new tasks
    showSystemAcceptingJobsBanner();
    
    // Display updated queue stats after job starts running
    displayQueueStats();
  });
  
  manager.on('job:completed', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.green(`\n✅ THREAD #${data.queueIndex} COMPLETED: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Completed at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray(`   Processing time: ${((data.completedAt - data.startedAt) / 1000).toFixed(2)} seconds`));
    
    // Track batch job completion
    if (jobName.includes('Batch-')) {
      batchJobsCompleted++;
      
      // Show batch progress
      showBatchProgress(batchJobsTotal, batchJobsCompleted, batchJobsFailed);
      
      // Check if batch is complete
      if (batchJobsCompleted + batchJobsFailed === batchJobsTotal) {
        console.log(chalk.bgGreen.black(`\n🎉 BATCH COMPLETED: All ${batchJobsTotal} jobs finished (${batchJobsCompleted} successful, ${batchJobsFailed} failed)`));
        batchInProgress = false;
      }
    }
    
    showSystemAcceptingJobsBanner();
    
    // Display updated queue stats after job completion
    displayQueueStats();
  });
  
  manager.on('job:failed', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.red(`\n❌ THREAD #${data.queueIndex} FAILED: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Failed at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.red(`   Error: ${data.error?.message || 'Unknown error'}`));
    
    // Track batch job failure
    if (jobName.includes('Batch-')) {
      batchJobsFailed++;
      
      // Show batch progress
      showBatchProgress(batchJobsTotal, batchJobsCompleted, batchJobsFailed);
      
      // Check if batch is complete
      if (batchJobsCompleted + batchJobsFailed === batchJobsTotal) {
        console.log(chalk.bgYellow.black(`\n🎉 BATCH COMPLETED: All ${batchJobsTotal} jobs finished (${batchJobsCompleted} successful, ${batchJobsFailed} failed)`));
        batchInProgress = false;
      }
    }
    
    showSystemAcceptingJobsBanner();
    
    // Display updated queue stats after job failure
    displayQueueStats();
  });
  
  manager.on('job:timeout', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.yellow(`\n⏱️ THREAD #${data.queueIndex} TIMEOUT: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Timed out at: ${new Date().toLocaleTimeString()}`));
    
    // Track batch job timeout as failure
    if (jobName.includes('Batch-')) {
      batchJobsFailed++;
      
      // Show batch progress
      showBatchProgress(batchJobsTotal, batchJobsCompleted, batchJobsFailed);
      
      // Check if batch is complete
      if (batchJobsCompleted + batchJobsFailed === batchJobsTotal) {
        console.log(chalk.bgYellow.black(`\n🎉 BATCH COMPLETED: All ${batchJobsTotal} jobs finished (${batchJobsCompleted} successful, ${batchJobsFailed} failed)`));
        batchInProgress = false;
      }
    }
    
    showSystemAcceptingJobsBanner();
    
    // Display updated queue stats after job timeout
    displayQueueStats();
  });
  
  // Listen for queue management events
  manager.on('queues:added', (data) => {
    console.log(chalk.blue(`\n➕ QUEUES ADDED: ${data.addedCount} new queues created. Total queues: ${data.newCount}`));
    displayQueueStats();
  });
  
  manager.on('queues:removed', (data) => {
    console.log(chalk.blue(`\n➖ QUEUES REMOVED: ${data.removedCount} queues removed. Total queues: ${data.newCount}`));
    console.log(chalk.gray(`   Redistributed ${data.redistributedJobs} pending jobs to remaining queues`));
    displayQueueStats();
  });
  
  manager.on('concurrency:updated', (data) => {
    console.log(chalk.blue(`\n⚙️ CONCURRENCY UPDATED: Each queue can now process ${data.newConcurrency} jobs simultaneously`));
    displayQueueStats();
  });
}

// Show a banner indicating the system is still accepting jobs
function showSystemAcceptingJobsBanner() {
  if (systemRunning) {
    console.log(chalk.bgGreen.black('\n 🟢 SYSTEM IS ACTIVE: You can add new tasks while other tasks are running 🟢 '));
  } else {
    console.log(chalk.bgRed.white('\n 🔴 SYSTEM PAUSED: Not accepting new tasks 🔴 '));
  }
}

// Start the queue system with user-specified queue count and concurrency
function initializeQueueSystem(): void {
  console.clear();
  console.log(chalk.bold.yellow('╔════════════════════════════════════╗'));
  console.log(chalk.bold.yellow('║      QUEUE SYSTEM INITIALIZATION   ║'));
  console.log(chalk.bold.yellow('╚════════════════════════════════════╝'));
  
  rl.question(chalk.cyan('How many queues would you like to create? '), (answer: string) => {
    const queueCount = parseInt(answer, 10);
    
    if (isNaN(queueCount) || queueCount <= 0) {
      console.log(chalk.red('⚠️ Please enter a valid number greater than 0'));
      initializeQueueSystem();
      return;
    }
    
    rl.question(chalk.cyan('How many concurrent jobs per queue? '), (concurrencyStr: string) => {
      const concurrency = parseInt(concurrencyStr, 10);
      
      if (isNaN(concurrency) || concurrency <= 0) {
        console.log(chalk.red('⚠️ Please enter a valid number greater than 0'));
        initializeQueueSystem();
        return;
      }
      
      manager = new QueueManager({ 
        queueCount, 
        timeoutMs: 10000,
        concurrencyPerQueue: concurrency
      });
      
      console.log(chalk.green(`✅ Queue system initialized with:`));
      console.log(chalk.green(`   - ${queueCount} parallel queues`));
      console.log(chalk.green(`   - ${concurrency} concurrent jobs per queue`));
      console.log(chalk.green(`   - ${queueCount * concurrency} total concurrent jobs possible`));
      
      systemRunning = true;
      showSystemAcceptingJobsBanner();
      
      // Set up event listeners
      setupManagerEventListeners();
      
      displayQueueStats();
      displayMenu();
    });
  });
}

// Toggle automatic request generation
function toggleAutoRequestGeneration(): void {
  autoGenerateRequests = !autoGenerateRequests;
  
  if (autoGenerateRequests) {
    console.log(chalk.green('✅ Automatic request generation enabled'));
    startAutoGeneration();
  } else {
    console.log(chalk.yellow('⏹️ Automatic request generation disabled'));
    if (autoGenerateInterval) {
      clearTimeout(autoGenerateInterval);
      autoGenerateInterval = null;
    }
  }
}

// Toggle system running state
function toggleSystemRunning(): void {
  systemRunning = !systemRunning;
  
  if (systemRunning) {
    console.log(chalk.green('✅ System is now accepting new tasks'));
    manager.resumeAllQueues();
  } else {
    console.log(chalk.yellow('⏹️ System is now not accepting new tasks'));
    manager.pauseAllQueues();
  }
  
  showSystemAcceptingJobsBanner();
}

// Start automatic request generation
function startAutoGeneration(): void {
  if (!autoGenerateRequests) return;
  
  // Create a random request every 1-3 seconds
  const interval = Math.floor(Math.random() * 500) + 500; // Faster generation for testing concurrency
  
  autoGenerateInterval = setTimeout(() => {
    if (systemRunning) {
      generateRequest();
    }
    startAutoGeneration();
  }, interval);
}

// Generate a single request
async function generateRequest(): Promise<void> {
  if (!systemRunning) {
    console.log(chalk.yellow('⚠️ System is paused. Not accepting new tasks.'));
    return;
  }
  
  const requestName = `Request-${requestIdCounter++}`;
  
  console.log(chalk.cyan(`\n📥 Received new request: ${requestName}`));
  
  try {
    console.log(chalk.blue(`🔄 Assigning ${requestName} to the emptiest queue thread...`));
    const jobId = await manager.addJob({ name: requestName });
    jobIdMap.set(requestName, jobId);
    
    console.log(chalk.green(`✅ Added ${requestName} to queue - Job ID: ${jobId}`));
    displayQueueStats();
    
    // We no longer need to manually simulate job completion as the event system handles it
  } catch (error) {
    console.error(chalk.red(`❌ Error adding job ${requestName}:`, error));
  }
}

// Display visual representation of queue stats
function displayQueueStats(): void {
  const stats = manager.getStats();
  
  console.log(chalk.bold.yellow('\n╔═══════════════════════ THREAD STATUS ═══════════════════════╗'));
  
  stats.forEach(queue => {
    // Create a visual representation of the queue
    const threadStatus = queue.isActive ? 
      (queue.running > 0 ? chalk.green('▶️ ACTIVE') : chalk.gray('⏸️ IDLE')) : 
      chalk.red('⏹️ STOPPED');
    
    const queueBar = createQueueBar(queue.length);
    const concurrencyInfo = `${queue.running}/${queue.maxConcurrency} jobs running`;
    
    // Show running/pending status in a more visual way
    let runningDisplay = '';
    if (queue.running > 0) {
      runningDisplay = '🟢'.repeat(queue.running) + '⚪'.repeat(queue.maxConcurrency - queue.running);
    } else {
      runningDisplay = '⚪'.repeat(queue.maxConcurrency);
    }
    
    // Show pending jobs
    const pendingDisplay = queue.length > 0 ? '🟠'.repeat(Math.min(queue.length, 5)) + (queue.length > 5 ? `+${queue.length - 5}` : '') : '○';
    
    console.log(chalk.yellow(`║ Thread #${queue.queueId.toString().padStart(2, ' ')} | ${threadStatus} | Running: ${runningDisplay} | Pending: ${pendingDisplay} ║`));
  });
  
  // Calculate totals
  const totalRunning = stats.reduce((sum, q) => sum + q.running, 0);
  const totalPending = stats.reduce((sum, q) => sum + q.length, 0);
  const totalMaxConcurrent = stats.reduce((sum, q) => sum + q.maxConcurrency, 0);
  
  console.log(chalk.yellow('╠═════════════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow(`║ TOTALS: ${totalRunning}/${totalMaxConcurrent} jobs running | ${totalPending} jobs pending                  ║`));
  
  // Add color-coded job status explanation
  console.log(chalk.yellow('╠═════════════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow(`║ 🟢 = Running job | 🟠 = Pending job | ⚪ = Available slot                ║`));
  console.log(chalk.bold.yellow('╚═════════════════════════════════════════════════════════════╝'));
}

// Create a visual bar for queue load
function createQueueBar(length: number): string {
  const maxBarLength = 20;
  const filledLength = Math.min(length, maxBarLength);
  const emptyLength = maxBarLength - filledLength;
  
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);
  
  if (length > maxBarLength) {
    return chalk.red(filled) + ` (${length})`;
  } else if (length > maxBarLength / 2) {
    return chalk.yellow(filled) + chalk.gray(empty);
  } else {
    return chalk.green(filled) + chalk.gray(empty);
  }
}

// Manually create a named request
async function createManualRequest(): Promise<void> {
  if (!systemRunning) {
    console.log(chalk.yellow('⚠️ System is paused. Not accepting new tasks.'));
    displayMenu();
    return;
  }
  
  rl.question(chalk.cyan('Enter a name for your request: '), async (requestName: string) => {
    if (!requestName.trim()) {
      console.log(chalk.red('⚠️ Request name cannot be empty'));
      displayMenu();
      return;
    }
    
    try {
      console.log(chalk.cyan(`\n📥 Processing manual request: ${requestName}`));
      console.log(chalk.blue(`🔄 Assigning ${requestName} to the emptiest queue thread...`));
      
      // Add the job to the queue manager
      const jobId = await manager.addJob({ name: requestName });
      jobIdMap.set(requestName, jobId);
      
      console.log(chalk.green(`✅ Added ${requestName} to queue - Job ID: ${jobId}`));
      displayQueueStats();
      
      displayMenu();
    } catch (error) {
      console.error(chalk.red(`❌ Error adding job ${requestName}:`, error));
      displayMenu();
    }
  });
}

// Create multiple jobs at once
async function createBatchRequests(): Promise<void> {
  if (!systemRunning) {
    console.log(chalk.yellow('⚠️ System is paused. Not accepting new tasks.'));
    displayMenu();
    return;
  }
  
  rl.question(chalk.cyan('How many jobs to create in batch? '), async (countStr: string) => {
    const count = parseInt(countStr, 10);
    
    if (isNaN(count) || count <= 0) {
      console.log(chalk.red('⚠️ Please enter a valid number greater than 0'));
      displayMenu();
      return;
    }
    
    console.log(chalk.cyan(`\n📥 Creating batch of ${count} requests simultaneously...`));
    console.log(chalk.blue(`🔄 All jobs will be added at once - some will run immediately, others will be queued as pending`));
    
    // Prepare all job promises
    const jobPromises: Promise<string>[] = [];
    const jobNames: string[] = [];
    
    // Create all jobs at once (in parallel)
    for (let i = 0; i < count; i++) {
      const requestName = `Batch-${i+1}-of-${count}`;
      jobNames.push(requestName);
      
      // Add to promises array (don't await here)
      jobPromises.push(manager.addJob({ name: requestName }));
    }
    
    // Wait for all jobs to be added simultaneously
    try {
      const jobIds = await Promise.all(jobPromises);
      
      // Map job names to IDs
      jobNames.forEach((name, index) => {
        jobIdMap.set(name, jobIds[index]);
      });
      
      console.log(chalk.green(`\n✅ Successfully added ${count} jobs SIMULTANEOUSLY to the system!`));
      console.log(chalk.yellow(`ℹ️ Some jobs are now running while others are pending in the queue`));
      
      displayQueueStats();
      
      // Extra visualization to show which are running vs pending
      const stats = manager.getStats();
      const totalRunning = stats.reduce((sum, q) => sum + q.running, 0);
      const totalPending = stats.reduce((sum, q) => sum + q.length, 0);
      
      console.log(chalk.bgCyan.black(`\n📊 BATCH JOB STATUS: ${totalRunning} running, ${totalPending} pending in queue`));
      
    } catch (error) {
      console.error(chalk.red(`❌ Error adding batch jobs:`, error));
    }
    
    displayMenu();
  });
}

// Simulate job completion for a specific job ID
function simulateJobCompletion(jobId: string): void {
  if (!jobIdMap.has(jobId)) {
    console.log(chalk.red(`❌ Job ID ${jobId} not found`));
    return;
  }
  
  // 90% chance of success, 10% chance of failure
  const isSuccess = Math.random() > 0.1;
  
  if (isSuccess) {
    console.log(chalk.blue(`\n🔄 Simulating successful completion for job: ${jobId}`));
    manager.completeJob(jobId);
  } else {
    console.log(chalk.blue(`\n🔄 Simulating failure for job: ${jobId}`));
    manager.failJob(jobId, new Error(`Simulated failure for job ${jobId}`));
  }
}

// Display menu for user interactions
function displayMenu(): void {
  const systemStatusText = systemRunning ? chalk.green('ACTIVE - ACCEPTING TASKS') : chalk.red('PAUSED - NOT ACCEPTING TASKS');
  
  console.log(chalk.bold.cyan('\n┌────────────── MULTI-THREADING QUEUE SYSTEM ─────────────┐'));
  console.log(chalk.cyan(`│ SYSTEM STATUS: ${systemStatusText.padEnd(42)} │`));
  console.log(chalk.cyan('│                                                            │'));
  console.log(chalk.cyan('│ 1. Show current thread status                              │'));
  console.log(chalk.cyan('│ 2. Change number of queues (threads)                       │'));
  console.log(chalk.cyan('│ 3. Change concurrency per queue                            │'));
  console.log(chalk.cyan('│ 4. Add a single request manually                           │'));
  console.log(chalk.cyan('│ 5. Add multiple requests in batch                          │'));
  console.log(chalk.cyan('│ 6. Simulate manual completion of a job                     │'));
  console.log(chalk.cyan(`│ 7. ${autoGenerateRequests ? 'Disable' : 'Enable'} automatic request generation               │`));
  console.log(chalk.cyan(`│ 8. ${systemRunning ? 'Pause' : 'Resume'} system (stop/start accepting new tasks)      │`));
  console.log(chalk.cyan('│ 9. Clear console                                           │'));
  console.log(chalk.cyan('│ 0. Exit                                                    │'));
  console.log(chalk.bold.cyan('└────────────────────────────────────────────────────────┘'));
  
  rl.question(chalk.bold.cyan('Select an option: '), (answer: string) => {
    switch (answer) {
      case '1':
        displayQueueStats();
        displayMenu();
        break;
        
      case '2':
        rl.question(chalk.cyan('Enter new queue count: '), (countStr: string) => {
          const newCount = parseInt(countStr, 10);
          if (isNaN(newCount) || newCount <= 0) {
            console.log(chalk.red('⚠️ Please enter a valid number greater than 0'));
          } else {
            console.log(chalk.yellow(`⚙️ Adjusting queue count from ${manager.getStats().length} to ${newCount}...`));
            manager.updateQueueCount(newCount);
          }
          displayMenu();
        });
        break;
        
      case '3':
        rl.question(chalk.cyan('Enter new concurrency per queue: '), (countStr: string) => {
          const newConcurrency = parseInt(countStr, 10);
          if (isNaN(newConcurrency) || newConcurrency <= 0) {
            console.log(chalk.red('⚠️ Please enter a valid number greater than 0'));
          } else {
            console.log(chalk.yellow(`⚙️ Adjusting concurrency per queue to ${newConcurrency}...`));
            manager.updateConcurrencyPerQueue(newConcurrency);
          }
          displayMenu();
        });
        break;
        
      case '4':
        createManualRequest();
        break;
        
      case '5':
        createBatchRequests();
        break;
        
      case '6':
        rl.question(chalk.cyan('Enter job ID to complete: '), (jobId: string) => {
          if (!jobId.trim()) {
            console.log(chalk.red('⚠️ Job ID cannot be empty'));
          } else {
            simulateJobCompletion(jobId);
          }
          displayMenu();
        });
        break;
        
      case '7':
        toggleAutoRequestGeneration();
        displayMenu();
        break;
        
      case '8':
        toggleSystemRunning();
        displayMenu();
        break;
        
      case '9':
        console.clear();
        displayQueueStats();
        displayMenu();
        break;
        
      case '0':
        console.log(chalk.yellow('👋 Exiting simulation...'));
        if (autoGenerateInterval) {
          clearTimeout(autoGenerateInterval);
        }
        manager.shutdownAllQueues();
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log(chalk.red('❌ Invalid option. Please try again.'));
        displayMenu();
    }
  });
}

// Show batch job progress
function showBatchProgress(total: number, completed: number, failed: number): void {
  const pending = total - completed - failed;
  const percent = Math.floor((completed + failed) / total * 100);
  
  // Create progress bar
  const progressLength = 30;
  const completedLength = Math.floor((completed / total) * progressLength);
  const failedLength = Math.floor((failed / total) * progressLength);
  const pendingLength = progressLength - completedLength - failedLength;
  
  const completedBar = chalk.green('█'.repeat(completedLength));
  const failedBar = chalk.red('█'.repeat(failedLength));
  const pendingBar = chalk.gray('░'.repeat(pendingLength));
  
  console.log(chalk.bgBlue.white(`\n📊 BATCH PROGRESS: ${percent}% complete | ${completed} done | ${failed} failed | ${pending} pending`));
  console.log(`${completedBar}${failedBar}${pendingBar} ${completed + failed}/${total}`);
}

// Start the simulation
console.clear();
console.log(chalk.bold.yellow('╔═══════════════════════════════════════════╗'));
console.log(chalk.bold.yellow('║       MULTI-THREADED QUEUE SIMULATION     ║'));
console.log(chalk.bold.yellow('╚═══════════════════════════════════════════╝'));
console.log(chalk.gray('Each queue has its own independent thread that processes jobs concurrently'));
console.log(chalk.bgGreen.black(' 🟢 You can add new tasks while other tasks are running 🟢 '));
initializeQueueSystem();
