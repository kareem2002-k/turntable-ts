export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out';

export interface Job<T = any> {
  id: string;
  data: T;
  timeoutMs?: number;
  createdAt: number;
  status: JobStatus;
  startedAt?: number;
  completedAt?: number;
  timeoutRef?: NodeJS.Timeout;
  error?: Error;
  
  // Callback-style for better threading model
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export interface QueueOptions {
  concurrency?: number; // default = 1
  defaultTimeoutMs?: number;
}

export interface ManagerOptions {
  queueCount: number;
  timeoutMs?: number;
  concurrencyPerQueue?: number; // Default = 1 
}

// Request and Webhook handling types
export interface WebhookCallback {
  jobId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
}

export interface JobRequest<T = any> {
  data: T;
  timeoutMs?: number;
} 