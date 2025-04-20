import express, { Request, Response, NextFunction, Router } from 'express';
import { QueueManager } from './QueueManager';
import { JobRequest, WebhookCallback } from './types';

/**
 * Options for configuring the API integration
 */
export interface ApiIntegrationOptions {
  /**
   * Base path for API endpoints (defaults to '/api/queue')
   */
  basePath?: string;
  
  /**
   * Request path (defaults to '/jobs')
   */
  requestPath?: string;
  
  /**
   * Webhook callback path (defaults to '/webhook')
   */
  webhookPath?: string;
  
  /**
   * Secret key for webhook authentication (optional)
   */
  webhookSecret?: string;
  
  /**
   * Optional middleware to run before processing requests
   */
  middleware?: any[];
  
  /**
   * Optional function to transform job data before adding to queue
   */
  transformJobData?: (data: any) => any;
  
  /**
   * Optional function to validate webhook requests
   */
  validateWebhook?: (req: Request) => boolean;
}

/**
 * Creates Express API routes for the queue system
 * 
 * @param queueManager The queue manager to use
 * @param options Configuration options
 * @returns Express router with API endpoints
 */
export function createQueueApiRoutes<T = any>(
  queueManager: QueueManager<T>,
  options: ApiIntegrationOptions = {}
): Router {
  const router = express.Router();
  
  // Set default options
  const {
    basePath = '/api/queue',
    requestPath = '/jobs',
    webhookPath = '/webhook',
    webhookSecret,
    middleware = [],
    transformJobData = (data: any) => data,
    validateWebhook = () => true
  } = options;
  
  // Apply middleware if provided
  if (middleware && middleware.length > 0) {
    router.use(middleware);
  }
  
  // Route for adding a job to the queue
  router.post(requestPath, async (req: Request, res: Response) => {
    try {
      const jobRequest = req.body as JobRequest<T>;
      
      if (!jobRequest || !jobRequest.data) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid job request. Missing data.' 
        });
      }
      
      // Transform data if needed
      const transformedData = transformJobData(jobRequest.data);
      
      // Add to queue
      const jobId = await queueManager.addJob(transformedData as T);
      
      // Return job ID and status
      return res.status(201).json({
        success: true,
        jobId,
        message: 'Job added to queue',
        status: 'pending'
      });
      
    } catch (error) {
      console.error('Error adding job to queue:', error);
      return res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // Route for webhook callbacks
  router.post(webhookPath, (req: Request, res: Response) => {
    try {
      // Validate webhook if needed
      if (!validateWebhook(req)) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid webhook' 
        });
      }
      
      const callback = req.body as WebhookCallback;
      
      if (!callback || !callback.jobId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid webhook callback. Missing jobId.' 
        });
      }
      
      // Handle job completion/failure based on status
      if (callback.status === 'success') {
        queueManager.completeJob(callback.jobId);
      } else {
        const error = callback.error ? new Error(callback.error) : undefined;
        queueManager.failJob(callback.jobId, error);
      }
      
      return res.status(200).json({
        success: true,
        message: `Job ${callback.jobId} ${callback.status === 'success' ? 'completed' : 'failed'}`
      });
      
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // Route for checking job status (extra utility)
  router.get(`${requestPath}/status`, (req: Request, res: Response) => {
    try {
      const stats = queueManager.getStats();
      
      return res.status(200).json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  return router;
}

/**
 * Creates a webhook handler middleware for the queue manager
 * 
 * @param queueManager The queue manager to use
 * @param secret Optional secret key for authentication
 * @returns Express middleware for handling webhooks
 */
export function createWebhookHandler<T = any>(
  queueManager: QueueManager<T>,
  secret?: string
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate secret if provided
    if (secret) {
      const providedSecret = req.headers['x-webhook-secret'];
      if (providedSecret !== secret) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid webhook secret' 
        });
      }
    }
    
    try {
      const callback = req.body as WebhookCallback;
      
      if (!callback || !callback.jobId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid webhook callback. Missing jobId.' 
        });
      }
      
      // Handle job completion/failure based on status
      if (callback.status === 'success') {
        queueManager.completeJob(callback.jobId);
      } else {
        const error = callback.error ? new Error(callback.error) : undefined;
        queueManager.failJob(callback.jobId, error);
      }
      
      return res.status(200).json({
        success: true,
        message: `Job ${callback.jobId} ${callback.status === 'success' ? 'completed' : 'failed'}`
      });
      
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };
} 