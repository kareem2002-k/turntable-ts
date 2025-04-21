import { PrismaClient } from '@prisma/client';
import { createQueue, QueueManager } from '../src/index';

/**
 * Example of turntable-queue usage for a simple job processing system
 * 
 * This example shows how to:
 * 1. Initialize the queue system 
 * 2. Add jobs to the queue
 * 3. Process jobs when they are ready
 * 4. Handle job completion/failure
 */

// Define our job type for better type safety
interface EmailJob {
  type: 'email';
  to: string;
  subject: string;
  body: string;
  priority?: 'high' | 'normal' | 'low';
}

interface ImageProcessingJob {
  type: 'image_processing';
  imageUrl: string;
  operations: ('resize' | 'crop' | 'blur' | 'optimize')[];
  outputFormat?: 'jpg' | 'png' | 'webp';
  metadata?: Record<string, string>;
}

// Union type of all possible job types
type JobTypes = EmailJob | ImageProcessingJob;

// This would typically come from your application's database setup
const prisma = new PrismaClient();

// Initialize the queue manager with our Prisma client
const queueManager = createQueue({
  prismaClient: prisma,
  queueCount: 2,                // Use 2 parallel queues
  concurrencyPerQueue: 3,       // Process up to 3 jobs simultaneously per queue
  timeoutMs: 30000,             // Jobs timeout after 30 seconds
  autoCleanupDays: 7            // Auto-cleanup jobs older than 7 days
});

// Helper to print the current queue status
function printQueueStatus() {
  const stats = queueManager.getStats();
  console.log('\n----- QUEUE STATUS -----');
  
  let totalPending = 0;
  let totalRunning = 0;
  
  stats.forEach((queueStat) => {
    console.log(`Queue #${queueStat.queueId}: ${queueStat.running} running, ${queueStat.length} pending (Max concurrency: ${queueStat.maxConcurrency})`);
    totalPending += queueStat.length;
    totalRunning += queueStat.running;
  });
  
  console.log(`Total: ${totalRunning} running, ${totalPending} pending`);
  console.log('------------------------\n');
}

// Register a job processor to handle jobs when they're ready to run
queueManager.on('job:started', async (job) => {
  console.log(`Processing job ${job.id}`);
  
  try {
    const result = await processJob(job.data);
    console.log(`Job ${job.id} completed successfully:`, result);
    queueManager.completeJob(job.id);
  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    queueManager.failJob(job.id, error instanceof Error ? error : new Error(String(error)));
  }
});

// Job processor that handles different job types
async function processJob(jobData: JobTypes): Promise<any> {
  // Based on the job type, call the appropriate handler
  switch (jobData.type) {
    case 'email':
      return await processEmailJob(jobData);
    case 'image_processing':
      return await processImageJob(jobData);
    default:
      throw new Error(`Unknown job type: ${(jobData as any).type}`);
  }
}

// Process an email job
async function processEmailJob(job: EmailJob): Promise<{ sent: boolean, to: string }> {
  console.log(`Sending email to ${job.to} with subject "${job.subject}"`);
  
  // In a real app, you would connect to an email service
  // For this example, we'll simulate sending by waiting
  const delay = job.priority === 'high' ? 500 : 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Simulate success (or randomly fail some jobs)
  if (Math.random() > 0.9) {
    throw new Error(`Failed to send email to ${job.to}`);
  }
  
  return { sent: true, to: job.to };
}

// Process an image job
async function processImageJob(job: ImageProcessingJob): Promise<{ processed: boolean, operations: string[] }> {
  console.log(`Processing image: ${job.imageUrl}`);
  console.log(`Applying operations: ${job.operations.join(', ')}`);
  
  // Simulate processing time based on number of operations
  const processingTime = 1000 * job.operations.length;
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate occasional failure
  if (Math.random() > 0.85) {
    throw new Error(`Failed to process image: ${job.imageUrl}`);
  }
  
  return { 
    processed: true, 
    operations: job.operations,
    outputFormat: job.outputFormat || 'jpg'
  };
}

// Example: Add some test jobs
async function addSampleJobs() {
  console.log('\n----- ADDING SAMPLE JOBS -----');
  
  // Add a few email jobs
  const emailPromises = [
    queueManager.addJob<EmailJob>({
      type: 'email',
      to: 'user1@example.com',
      subject: 'Welcome to our service',
      body: 'Thank you for signing up!',
      priority: 'high'
    }),
    queueManager.addJob<EmailJob>({
      type: 'email',
      to: 'user2@example.com',
      subject: 'Your weekly newsletter',
      body: 'Here are this week\'s top stories...',
      priority: 'normal'
    }),
    queueManager.addJob<EmailJob>({
      type: 'email',
      to: 'user3@example.com',
      subject: 'Promotional offer',
      body: 'Don\'t miss out on our latest deals!',
      priority: 'low'
    })
  ];
  
  // Add a few image processing jobs
  const imagePromises = [
    queueManager.addJob<ImageProcessingJob>({
      type: 'image_processing',
      imageUrl: 'https://example.com/image1.jpg',
      operations: ['resize', 'optimize'],
      outputFormat: 'webp'
    }),
    queueManager.addJob<ImageProcessingJob>({
      type: 'image_processing',
      imageUrl: 'https://example.com/image2.png',
      operations: ['crop', 'blur', 'optimize'],
      outputFormat: 'png'
    })
  ];
  
  // Wait for all jobs to be added
  const emailJobIds = await Promise.all(emailPromises);
  const imageJobIds = await Promise.all(imagePromises);
  
  console.log(`Added ${emailJobIds.length} email jobs and ${imageJobIds.length} image processing jobs`);
  console.log('-----------------------------\n');
  
  // Print queue status after adding jobs
  printQueueStatus();
  
  return [...emailJobIds, ...imageJobIds];
}

// Main execution
async function main() {
  console.log('Starting queue processing example...');
  printQueueStatus();
  
  const jobIds = await addSampleJobs();
  
  // Monitor the queue status for a while
  const duration = 30; // seconds to monitor
  let elapsed = 0;
  
  const statusInterval = setInterval(() => {
    elapsed++;
    printQueueStatus();
    
    // Check if all jobs are completed
    const stats = queueManager.getStats();
    const totalJobs = stats.reduce((sum, queue) => sum + queue.length + queue.running, 0);
    
    if (totalJobs === 0 || elapsed >= duration) {
      clearInterval(statusInterval);
      shutdown();
    }
  }, 1000);
  
  // Also add a forced shutdown after the duration
  setTimeout(() => {
    clearInterval(statusInterval);
    shutdown();
  }, duration * 1000);
}

// Properly shut down the application
async function shutdown() {
  console.log('Shutting down queue manager...');
  await queueManager.shutdown();
  await prisma.$disconnect();
  console.log('Shutdown complete');
  process.exit(0);
}

// Handle graceful shutdown on SIGTERM
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the example
main().catch(error => {
  console.error('Error in main execution:', error);
  shutdown();
}); 