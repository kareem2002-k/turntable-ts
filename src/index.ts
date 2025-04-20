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

// Set up event listeners for queue manager events
function setupManagerEventListeners(): void {
  if (!manager) return;
  
  // Listen for job lifecycle events
  manager.on('job:started', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.magenta(`\n⚡ THREAD #${data.queueIndex} ACTIVATED: Started processing job: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Started at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray(`   Expected timeout: ${data.timeoutMs / 1000} seconds if no response`));
    
    // Display updated queue stats after job starts running
    displayQueueStats();
  });
  
  manager.on('job:completed', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.green(`\n✅ THREAD #${data.queueIndex} COMPLETED: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Completed at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray(`   Processing time: ${((data.completedAt - data.startedAt) / 1000).toFixed(2)} seconds`));
    
    // Display updated queue stats after job completion
    displayQueueStats();
  });
  
  manager.on('job:failed', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.red(`\n❌ THREAD #${data.queueIndex} FAILED: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Failed at: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.red(`   Error: ${data.error?.message || 'Unknown error'}`));
    
    // Display updated queue stats after job failure
    displayQueueStats();
  });
  
  manager.on('job:timeout', (data) => {
    const jobName = data.data?.name || 'Unknown Job';
    console.log(chalk.yellow(`\n⏱️ THREAD #${data.queueIndex} TIMEOUT: ${jobName} (ID: ${data.id})`));
    console.log(chalk.gray(`   Timed out at: ${new Date().toLocaleTimeString()}`));
    
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

// Start automatic request generation
function startAutoGeneration(): void {
  if (!autoGenerateRequests) return;
  
  // Create a random request every 1-3 seconds
  const interval = Math.floor(Math.random() * 500) + 500; // Faster generation for testing concurrency
  
  autoGenerateInterval = setTimeout(() => {
    generateRequest();
    startAutoGeneration();
  }, interval);
}

// Generate a single request
async function generateRequest(): Promise<void> {
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
    
    console.log(chalk.yellow(`║ Thread #${queue.queueId.toString().padStart(2, ' ')} | ${threadStatus} | ${queueBar} | ${concurrencyInfo} | ${queue.length} pending ║`));
  });
  
  // Calculate totals
  const totalRunning = stats.reduce((sum, q) => sum + q.running, 0);
  const totalPending = stats.reduce((sum, q) => sum + q.length, 0);
  const totalMaxConcurrent = stats.reduce((sum, q) => sum + q.maxConcurrency, 0);
  
  console.log(chalk.yellow('╠═════════════════════════════════════════════════════════════╣'));
  console.log(chalk.yellow(`║ TOTALS: ${totalRunning}/${totalMaxConcurrent} jobs running | ${totalPending} jobs pending                  ║`));
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
  console.log(chalk.bold.cyan('\n┌────────────── MULTI-THREADING QUEUE SYSTEM ─────────────┐'));
  console.log(chalk.cyan('│ 1. Show current thread status                              │'));
  console.log(chalk.cyan('│ 2. Change number of queues (threads)                       │'));
  console.log(chalk.cyan('│ 3. Change concurrency per queue                            │'));
  console.log(chalk.cyan('│ 4. Add a request manually                                  │'));
  console.log(chalk.cyan('│ 5. Simulate manual completion of a job                     │'));
  console.log(chalk.cyan(`│ 6. ${autoGenerateRequests ? 'Disable' : 'Enable'} automatic request generation               │`));
  console.log(chalk.cyan('│ 7. Pause all queue threads                                 │'));
  console.log(chalk.cyan('│ 8. Resume all queue threads                                │'));
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
        rl.question(chalk.cyan('Enter job ID to complete: '), (jobId: string) => {
          if (!jobId.trim()) {
            console.log(chalk.red('⚠️ Job ID cannot be empty'));
          } else {
            simulateJobCompletion(jobId);
          }
          displayMenu();
        });
        break;
        
      case '6':
        toggleAutoRequestGeneration();
        displayMenu();
        break;
        
      case '7':
        console.log(chalk.yellow('⏸️ Pausing all queue threads...'));
        manager.pauseAllQueues();
        displayMenu();
        break;
        
      case '8':
        console.log(chalk.green('▶️ Resuming all queue threads...'));
        manager.resumeAllQueues();
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

// Start the simulation
console.clear();
console.log(chalk.bold.yellow('╔═══════════════════════════════════════════╗'));
console.log(chalk.bold.yellow('║       MULTI-THREADED QUEUE SIMULATION     ║'));
console.log(chalk.bold.yellow('╚═══════════════════════════════════════════╝'));
console.log(chalk.gray('Each queue has its own independent thread that processes jobs concurrently'));
initializeQueueSystem();
