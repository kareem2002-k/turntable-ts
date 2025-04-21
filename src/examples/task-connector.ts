import axios from 'axios';
import { QueueManager } from '../';

/**
 * TaskConnector handles sending queued tasks to the external service
 * 
 * This connects the queue system to the external service by:
 * 1. Listening for new jobs in the queue
 * 2. Forwarding them to the external service
 * 3. Letting the external service handle the processing
 * 4. External service will then send webhook callbacks when done
 */
export class TaskConnector {
  private queueManager: QueueManager;
  public externalServiceUrl: string;
  public isRunning: boolean = false;
  
  constructor(
    queueManager: QueueManager, 
    externalServiceUrl: string = 'http://localhost:3001/process'
  ) {
    this.queueManager = queueManager;
    this.externalServiceUrl = externalServiceUrl;
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Listen for jobs that start
    this.queueManager.on('job:started', async (data) => {
      try {
        await this.handleJobStarted(data);
      } catch (error) {
        console.error(`[CONNECTOR] Failed to process job ${data.id}: ${error instanceof Error ? error.message : String(error)}`);
        // Mark job as failed
        this.queueManager.failJob(data.id, error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  
  /**
   * Handle a job that has started and forward it to the external service
   */
  private async handleJobStarted(data: any) {
    if (!this.isRunning) {
      console.log(`[CONNECTOR] Task connector paused - job ${data.id} not forwarded`);
      return;
    }
    
    console.log(`[CONNECTOR] Forwarding job ${data.id} to external service`);
    
    try {
      // Send to external service
      const response = await axios.post(this.externalServiceUrl, {
        jobId: data.id,
        payload: data.data
      });
      
      console.log(`[CONNECTOR] Successfully sent job ${data.id} to external service (${response.status})`);
      
      // Note: We don't mark the job as completed here.
      // The external service will send a webhook callback when done.
      
    } catch (error) {
      console.error(`[CONNECTOR] Failed to send job ${data.id} to external service: ${error instanceof Error ? error.message : String(error)}`);
      
      // Mark job as failed immediately since we couldn't even send it
      this.queueManager.failJob(data.id, new Error('Failed to send job to external service'));
    }
  }
  
  /**
   * Start the connector
   */
  public start() {
    this.isRunning = true;
    console.log(`[CONNECTOR] Started - forwarding jobs to ${this.externalServiceUrl}`);
  }
  
  /**
   * Pause the connector (stops forwarding new jobs)
   */
  public pause() {
    this.isRunning = false;
    console.log('[CONNECTOR] Paused - not forwarding new jobs');
  }
  
  /**
   * Update the external service URL
   */
  public setExternalServiceUrl(url: string) {
    this.externalServiceUrl = url;
    console.log(`[CONNECTOR] External service URL updated to ${url}`);
  }
}

/**
 * Create and start a task connector with the given queue manager
 */
export function createTaskConnector(
  queueManager: QueueManager, 
  externalServiceUrl?: string
): TaskConnector {
  const connector = new TaskConnector(queueManager, externalServiceUrl);
  connector.start();
  return connector;
} 