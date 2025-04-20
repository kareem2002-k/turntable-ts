import { QueueManager } from './core/QueueManager';
import * as readline from 'readline';

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

// Start the queue system with user-specified queue count
function initializeQueueSystem(): void {
  rl.question('How many queues would you like to create? ', (answer: string) => {
    const queueCount = parseInt(answer, 10);
    
    if (isNaN(queueCount) || queueCount <= 0) {
      console.log('Please enter a valid number greater than 0');
      initializeQueueSystem();
      return;
    }
    
    manager = new QueueManager({ queueCount, timeoutMs: 10000 });
    console.log(`Queue system initialized with ${queueCount} queues.`);
    console.log('Initial stats:', manager.getStats());
    
    displayMenu();
  });
}

// Toggle automatic request generation
function toggleAutoRequestGeneration(): void {
  autoGenerateRequests = !autoGenerateRequests;
  
  if (autoGenerateRequests) {
    console.log('Automatic request generation enabled');
    startAutoGeneration();
  } else {
    console.log('Automatic request generation disabled');
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
  const interval = Math.floor(Math.random() * 2000) + 1000;
  
  autoGenerateInterval = setTimeout(() => {
    generateRequest();
    startAutoGeneration();
  }, interval);
}

// Generate a single request
async function generateRequest(): Promise<void> {
  const requestNumber = Math.floor(Math.random() * 1000);
  const requestName = `Request-${requestNumber}`;
  
  console.log(`\nReceived new request: ${requestName}`);
  
  try {
    // In a real system, you would get back a job ID 
    // For simulation, we'll create a random ID
    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    jobIdMap.set(requestName, jobId);
    
    await manager.addJob({ name: requestName });
    console.log(`Added ${requestName} to the queue`);
    console.log('Current queue stats:', manager.getStats());
    
    // Simulate random job completion (success/failure)
    simulateJobCompletion(requestName, jobId);
  } catch (error) {
    console.error(`Error adding job ${requestName}:`, error);
  }
}

// Manually create a named request
async function createManualRequest(): Promise<void> {
  rl.question('Enter a name for your request: ', async (requestName: string) => {
    try {
      const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      jobIdMap.set(requestName, jobId);
      
      await manager.addJob({ name: requestName });
      console.log(`Added ${requestName} to the queue`);
      console.log('Current queue stats:', manager.getStats());
      
      // Simulate random job completion (success/failure)
      simulateJobCompletion(requestName, jobId);
    } catch (error) {
      console.error(`Error adding job ${requestName}:`, error);
    }
    
    displayMenu();
  });
}

// Simulate job completion (success or failure)
function simulateJobCompletion(requestName: string, jobId: string): void {
  // Job will complete in 3-8 seconds
  const completionTime = Math.floor(Math.random() * 5000) + 3000;
  
  setTimeout(() => {
    // 90% chance of success, 10% chance of failure
    const isSuccess = Math.random() > 0.1;
    
    if (isSuccess) {
      console.log(`\nWebhook received: ${requestName} completed successfully`);
      manager.completeJob(jobId);
    } else {
      console.log(`\nWebhook received: ${requestName} failed`);
      manager.failJob(jobId, new Error(`${requestName} execution failed`));
    }
    
    console.log('Updated queue stats:', manager.getStats());
    jobIdMap.delete(requestName);
  }, completionTime);
}

// Display menu for user interactions
function displayMenu(): void {
  console.log('\n--- Queue Management System ---');
  console.log('1. Show current queue stats');
  console.log('2. Change number of queues');
  console.log('3. Add a request manually');
  console.log(`4. ${autoGenerateRequests ? 'Disable' : 'Enable'} automatic request generation`);
  console.log('5. Exit');
  
  rl.question('Select an option: ', (answer: string) => {
    switch (answer) {
      case '1':
        console.log('Current queue stats:', manager.getStats());
        displayMenu();
        break;
        
      case '2':
        rl.question('Enter new queue count: ', (countStr: string) => {
          const newCount = parseInt(countStr, 10);
          if (isNaN(newCount) || newCount <= 0) {
            console.log('Please enter a valid number greater than 0');
          } else {
            manager.updateQueueCount(newCount);
            console.log(`Queue count updated to ${newCount}`);
            console.log('New queue stats:', manager.getStats());
          }
          displayMenu();
        });
        break;
        
      case '3':
        createManualRequest();
        break;
        
      case '4':
        toggleAutoRequestGeneration();
        displayMenu();
        break;
        
      case '5':
        console.log('Exiting simulation...');
        if (autoGenerateInterval) {
          clearTimeout(autoGenerateInterval);
        }
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log('Invalid option. Please try again.');
        displayMenu();
    }
  });
}

// Start the simulation
console.log('Queue System Simulation');
console.log('----------------------');
initializeQueueSystem();
