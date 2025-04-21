import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Store child processes so we can close them later
const processes: ChildProcess[] = [];

/**
 * Start the API server process
 */
function startApiServer(): ChildProcess {
  console.log('[SYSTEM] Starting API Server...');
  const apiServer = spawn('ts-node', ['src/examples/api-server.ts'], {
    stdio: 'inherit',
    shell: true
  });
  
  apiServer.on('error', (error) => {
    console.error('[SYSTEM] API Server Error:', error);
  });
  
  return apiServer;
}

/**
 * Start the external service simulator process
 */
function startExternalService(): ChildProcess {
  console.log('[SYSTEM] Starting External Service...');
  const externalService = spawn('ts-node', ['src/examples/external-service.ts'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: '3001' // Make sure it doesn't conflict with API server
    }
  });
  
  externalService.on('error', (error) => {
    console.error('[SYSTEM] External Service Error:', error);
  });
  
  return externalService;
}

/**
 * Start the complete webhook-based queue system
 */
function startSystem() {
  // Ensure the workspace is properly set up
  checkWorkspace();
  
  // Display minimal welcome message
  console.log('[SYSTEM] Starting webhook-based queue system');
  
  // Start all processes
  processes.push(startApiServer());
  
  // Wait a bit for API server to be ready
  setTimeout(() => {
    processes.push(startExternalService());
    showHowToUse();
  }, 2000);
  
  // Handle termination
  process.on('SIGINT', () => {
    console.log('\n[SYSTEM] Shutting down all services...');
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
      console.error(`[SYSTEM] Required file ${file} not found.`);
      process.exit(1);
    }
  }
}

/**
 * Show how to use the system
 */
function showHowToUse() {
  console.log('[SYSTEM] Webhook queue system is running');
  console.log('[SYSTEM] API server: http://localhost:3000');
  console.log('[SYSTEM] External service: http://localhost:3001');
  console.log('[SYSTEM] Use Ctrl+C to stop all services');
}

// Start the system
startSystem(); 