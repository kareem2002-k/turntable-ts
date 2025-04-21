import { PrismaClient } from '@prisma/client';
import { PersistentQueueManager } from 'turntable-queue';
import nodemailer from 'nodemailer';
import express from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Mock email transport for demo purposes
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Set up the queue manager with our Prisma client
const queueManager = new PersistentQueueManager({
  prismaClient: prisma,             // Pass our Prisma client instance
  queueCount: 2,                    // Use 2 parallel queues
  concurrencyPerQueue: 3,           // Each queue processes 3 jobs at once
  timeoutMs: 60000,                 // Jobs timeout after 60 seconds
});

// Function to print queue status
function printQueueStatus() {
  const stats = queueManager.getStats();
  console.log('\n----- QUEUE STATUS -----');
  
  let totalPending = 0;
  let totalRunning = 0;
  
  stats.forEach((queueStat: any) => {
    console.log(`Queue #${queueStat.queueId}: ${queueStat.running} running, ${queueStat.length} pending (Max concurrency: ${queueStat.maxConcurrency})`);
    totalPending += queueStat.length;
    totalRunning += queueStat.running;
  });
  
  console.log(`Total: ${totalRunning} running, ${totalPending} pending`);
  console.log('------------------------\n');
  
  return { stats, totalRunning, totalPending };
}

// Add job processor event listener
queueManager.on('job:started', async (job: any) => {
  console.log(`Processing job ${job.id}`);
  try {
    await processOrderJob(job.data);
    queueManager.completeJob(job.id);
  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    queueManager.failJob(job.id, error instanceof Error ? error : new Error(String(error)));
  }
});

// Define the job processor function
async function processOrderJob(job: any) {
  console.log(`Processing order job:`, job);
  
  // If this is a test job, handle differently
  if (job.type === 'test') {
    console.log(`Simulating processing for test job #${job.testId}`);
    // Simulate processing time (between 2-5 seconds)
    const processingTime = 2000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    console.log(`Completed test job #${job.testId} in ${processingTime.toFixed(0)}ms`);
    return { success: true, testId: job.testId };
  }
  
  const { orderId, action } = job;
  
  try {
    // Retrieve the order with all related data
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });
    
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    // Perform different actions based on the job type
    switch (action) {
      case 'process_payment':
        await processPayment(order);
        break;
      case 'update_inventory':
        await updateInventory(order);
        break;
      case 'send_confirmation':
        await sendOrderConfirmation(order);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return { success: true, orderId };
  } catch (error) {
    console.error(`Error processing order ${orderId}:`, error);
    throw error; // Rethrow to mark job as failed
  }
}

// Mock payment processing
async function processPayment(order: any) {
  console.log(`Processing payment for order ${order.id}, amount: ${order.total}`);
  
  // Simulate API call to payment processor
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update order status
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'PROCESSING' }
  });
  
  console.log(`Payment processed for order ${order.id}`);
}

// Handle inventory updates
async function updateInventory(order: any) {
  console.log(`Updating inventory for order ${order.id}`);
  
  // Start a transaction to ensure all updates succeed or fail together
  await prisma.$transaction(
    order.items.map((item: any) => 
      prisma.product.update({
        where: { id: item.product.id },
        data: { stock: { decrement: item.quantity } }
      })
    )
  );
  
  console.log(`Inventory updated for order ${order.id}`);
}

// Send order confirmation email
async function sendOrderConfirmation(order: any) {
  console.log(`Sending confirmation email for order ${order.id} to ${order.user.email}`);
  
  const itemList = order.items
    .map((item: any) => `${item.quantity}x ${item.product.name} ($${item.price})`)
    .join('\n');
  
  const emailContent = `
    Dear ${order.user.name},
    
    Thank you for your order! Your order #${order.id} has been confirmed.
    
    Items:
    ${itemList}
    
    Total: $${order.total}
    
    We'll notify you when your order ships.
    
    Thanks,
    The Example Store Team
  `;
  
  await transporter.sendMail({
    from: 'orders@example.com',
    to: order.user.email,
    subject: `Order Confirmation #${order.id}`,
    text: emailContent
  });
  
  console.log(`Confirmation email sent for order ${order.id}`);
}

// Set up an Express server
const app = express();
app.use(express.json());

// Test endpoint that simulates 10 requests to test the queue
app.get('/test', async (req, res) => {
  console.log('\n===== STARTING QUEUE TEST WITH 10 JOBS =====');
  
  // Print initial queue status
  const initialStatus = printQueueStatus();
  
  // Create 10 test jobs
  const jobs = [];
  const jobPromises = [];
  
  for (let i = 1; i <= 10; i++) {
    console.log(`Adding test job #${i} to queue`);
    const jobPromise = queueManager.addJob({ 
      type: 'test', 
      testId: i,
      timestamp: new Date().toISOString() 
    });
    jobPromises.push(jobPromise);
  }
  
  // Wait for all jobs to be queued
  const jobIds = await Promise.all(jobPromises);
  
  // Print queue status after adding jobs
  const updatedStatus = printQueueStatus();
  
  // Set up a status tracker that will print status every second for 30 seconds
  const duration = 30; // seconds to track
  let elapsed = 0;
  
  const statusInterval = setInterval(() => {
    elapsed++;
    const currentStatus = printQueueStatus();
    
    // Stop tracking if all jobs are done or time is up
    if (elapsed >= duration || (currentStatus.totalPending === 0 && currentStatus.totalRunning === 0)) {
      clearInterval(statusInterval);
      console.log('===== QUEUE TEST MONITORING COMPLETED =====\n');
    }
  }, 1000);
  
  // Return response with job information
  return res.status(200).json({
    success: true,
    message: '10 test jobs added to queue',
    jobs: jobIds.map((id, index) => ({ 
      id, 
      testId: index + 1 
    })),
    queueStatus: updatedStatus
  });
});

// REST endpoint to create a new order and queue processing jobs
app.post('/orders', async (req, res) => {
  try {
    const { userId, items } = req.body;
    
    // Validate input
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    
    // Fetch product details to calculate total
    const productIds = items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      }
    });
    
    // Create order items with correct pricing
    const orderItems = items.map(item => {
      const product = products.find((p: any) => p.id === item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price
      };
    });
    
    // Calculate order total
    const total = orderItems.reduce((sum, item) => {
      const product = products.find((p: any) => p.id === item.productId)!;
      return sum + (product.price * item.quantity);
    }, 0);
    
    // Create the order
    const order = await prisma.order.create({
      data: {
        userId,
        total,
        status: 'PENDING',
        items: {
          create: orderItems
        }
      }
    });
    
    // Queue the order processing jobs
    await queueManager.addJob({ orderId: order.id, action: 'process_payment' });
    await queueManager.addJob({ orderId: order.id, action: 'update_inventory' });
    await queueManager.addJob({ orderId: order.id, action: 'send_confirmation' });
    
    return res.status(201).json({
      success: true,
      orderId: order.id,
      message: 'Order created and processing queued'
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get order status
app.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    return res.json({ order });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get queue status
app.get('/queues/status', (req, res) => {
  const status = printQueueStatus();
  return res.json({
    timestamp: new Date().toISOString(),
    queues: status.stats,
    summary: {
      totalQueues: status.stats.length,
      totalRunning: status.totalRunning,
      totalPending: status.totalPending
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Queue manager started');
  
  // Print initial queue status
  printQueueStatus();
  
  console.log('\nTEST ENDPOINTS:');
  console.log('- GET /test - Creates 10 test jobs and monitors queue status');
  console.log('- GET /queues/status - Shows current queue status\n');
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await queueManager.shutdown();
  await prisma.$disconnect();
  process.exit(0);
}); 