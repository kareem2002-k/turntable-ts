/**
 * This script launches the queue system, external service, and test client in separate terminals
 */

const { spawn } = require('child_process');
const os = require('os');

// Determine the platform-specific terminal command
const isWindows = os.platform() === 'win32';

// Function to open a new terminal window with a given command
function openTerminal(title, command, args = []) {
  console.log(`Opening terminal: ${title}`);
  
  if (isWindows) {
    // On Windows, use start cmd
    return spawn('cmd.exe', ['/c', 'start', title, 'cmd.exe', '/k', command, ...args], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    });
  } else {
    // On macOS/Linux, use gnome-terminal, xterm or Terminal.app
    try {
      // Try gnome-terminal first (Linux)
      return spawn('gnome-terminal', ['--title', title, '--', 'bash', '-c', `${command} ${args.join(' ')}; exec bash`], {
        detached: true,
        stdio: 'ignore'
      });
    } catch (e) {
      try {
        // Try Terminal.app (macOS)
        return spawn('osascript', [
          '-e', 
          `tell application "Terminal" to do script "${command} ${args.join(' ')}"`
        ], {
          detached: true,
          stdio: 'ignore'
        });
      } catch (e) {
        // Fall back to xterm
        return spawn('xterm', ['-T', title, '-e', `${command} ${args.join(' ')}; bash`], {
          detached: true,
          stdio: 'ignore'
        });
      }
    }
  }
}

// Start the API server in a new terminal
function startApiServer() {
  return openTerminal('Queue API Server', 'npx', ['ts-node', 'src/examples/api-server.ts']);
}

// Start the external service in a new terminal
function startExternalService() {
  return openTerminal('External Service', 'npx', ['ts-node', 'src/examples/external-service.ts']);
}

// Start the test client in a new terminal
function startTestClient() {
  return openTerminal('Test Client', 'npx', ['ts-node', 'src/examples/test-client.ts']);
}

// Main function to start all components
async function main() {
  console.log('Starting all services in separate terminals...');
  
  // Start the API server and wait a moment
  const apiServer = startApiServer();
  
  // Wait for the API server to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Start the external service and wait a moment
  const externalService = startExternalService();
  
  // Wait for the external service to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Start the test client
  const testClient = startTestClient();
  
  console.log('All services started. Each component is running in its own terminal window.');
  console.log('Press Ctrl+C in each terminal to stop the services.');
  
  // Allow the parent process to exit while leaving the child processes running
  apiServer.unref();
  externalService.unref();
  testClient.unref();
}

// Run the main function
main().catch(console.error); 