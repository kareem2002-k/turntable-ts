#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Model definition to be added
const MODEL_DEFINITION = `
// Job status enum for the queue
enum JobStatus {
  pending
  running
  completed
  failed
  timed_out
}

// Queue job model
model Job {
  id          String    @id
  data        Json      // Stores the job data as JSON
  status      JobStatus @default(pending)
  queueIndex  Int       // Which queue this job belongs to
  createdAt   DateTime  @default(now())
  startedAt   DateTime? 
  completedAt DateTime?
  timeoutMs   Int?      // Optional timeout milliseconds
  error       String?   // Error message if job failed
  retryCount  Int       @default(0) // For tracking retries
  
  @@index([status]) // Index to query by status efficiently
  @@index([queueIndex, status]) // Index to query by queue and status
}
`;

// Find the Prisma schema
function findPrismaSchema() {
  const possiblePaths = [
    './prisma/schema.prisma',
    './schema.prisma'
  ];
  
  for (const schemaPath of possiblePaths) {
    if (fs.existsSync(schemaPath)) {
      return schemaPath;
    }
  }
  
  return null;
}

// Main function
async function setup() {
  console.log('🔧 Setting up Turntable Queue System with Prisma...');
  
  // Step 1: Find the Prisma schema
  const schemaPath = findPrismaSchema();
  if (!schemaPath) {
    console.error('❌ Could not find Prisma schema. Please create one first.');
    console.log('   Run: npm install prisma --save-dev && npx prisma init');
    process.exit(1);
  }
  
  // Step 2: Check if Job model already exists
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  if (schemaContent.includes('model Job ') || schemaContent.includes('model Job{')) {
    console.log('⚠️ A Job model already exists in your schema. Skipping...');
    console.log('   You may need to manually update your schema to match the Turntable Queue requirements.');
    console.log('   See: https://github.com/your-org/turntable-ts#prisma-setup');
    process.exit(0);
  }
  
  // Step 3: Append the model to the schema
  console.log('✅ Adding Job model to Prisma schema...');
  fs.appendFileSync(schemaPath, MODEL_DEFINITION);
  
  // Step 4: Run Prisma generate
  try {
    console.log('✅ Running prisma generate...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    console.log('\n✨ Setup complete! You can now use PersistentQueueManager in your project.');
    console.log('\nNext steps:');
    console.log('1. Run a migration to apply the schema changes:');
    console.log('   npx prisma migrate dev --name add_job_queue');
    console.log('\n2. Import and use the PersistentQueueManager:');
    console.log(`
import { PersistentQueueManager } from 'turntable-ts';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const queueManager = new PersistentQueueManager({
  queueCount: 2,
  prismaClient: prisma,
  autoCleanupDays: 7,
});

// Add a job
const jobId = await queueManager.addJob({ task: 'process-something', data: {...} });
    `);
    
  } catch (error) {
    console.error('❌ Error generating Prisma client:', error);
    process.exit(1);
  }
}

// Run the setup
setup().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
}); 