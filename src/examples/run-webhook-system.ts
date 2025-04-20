import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Store child processes so we can close them later
const processes: ChildProcess[] = [];

/**
 * Start the API server process
 */
function startApiServer(): ChildProcess {
  console.log('🚀 Starting API Server...');
  const apiServer = spawn('ts-node', ['src/examples/api-server.ts'], {
    stdio: 'inherit',
    shell: true
  });
  
  apiServer.on('error', (error) => {
    console.error('❌ API Server Error:', error);
  });
  
  return apiServer;
}

/**
 * Start the external service simulator process
 */
function startExternalService(): ChildProcess {
  console.log('🚀 Starting External Service Simulator...');
  const externalService = spawn('ts-node', ['src/examples/external-service.ts'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: '3001' // Make sure it doesn't conflict with API server
    }
  });
  
  externalService.on('error', (error) => {
    console.error('❌ External Service Error:', error);
  });
  
  return externalService;
}

/**
 * Start the complete webhook-based queue system
 */
function startSystem() {
  // Ensure the workspace is properly set up
  checkWorkspace();
  
  // Display welcome banner
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                                                              
             🚀 WEBHOOK-BASED QUEUE SYSTEM DEMONSTRATION 🚀                    
                                                                              
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  This demo runs:
  1. An API server with queue system (port 3000)
  2. An external service simulator (port 3001)
  
  Flow:
  - API endpoints receive requests and add them to the queue
  - Jobs in the queue are forwarded to the external service 
  - External service processes jobs asynchronously
  - External service sends webhooks back to complete/fail jobs
  - Jobs timeout if no webhook is received within the timeout period
  
  CTRL+C to exit all processes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  
  // Start all processes
  processes.push(startApiServer());
  
  // Wait a bit for API server to be ready
  setTimeout(() => {
    processes.push(startExternalService());
    showHowToUse();
  }, 2000);
  
  // Handle termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down all services...');
    processes.forEach(p => {
      if (!p.killed) {
        p.kill();
      }
    });
    process.exit(0);
  });
}

/**
 * Check if the workspace has all required files
 */
function checkWorkspace() {
  const requiredFiles = [
    'src/examples/api-server.ts',
    'src/examples/external-service.ts'
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.resolve(file))) {
      console.error(`❌ Required file ${file} not found.`);
      process.exit(1);
    }
  }
}

/**
 * Show how to use the system
 */
function showHowToUse() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ System is now running! Try the following commands:
  
  1. Submit a task to the queue:
     curl -X POST http://localhost:3000/api/tasks \\
       -H "Content-Type: application/json" \\
       -d '{"payload": {"action": "process-data", "data": {"id": 123}}, "customTimeout": 30000}'
  
  2. Check queue status:
     curl http://localhost:3000/api/status
     
  3. View active jobs in external service:
     curl http://localhost:3000/api/status
     
  The external service will automatically process jobs with:
  - 80% success rate
  - 10% of jobs will never respond (simulates lost tasks)
  - Processing times between 3-15 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// Start the system
startSystem(); 