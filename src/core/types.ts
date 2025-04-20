export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out';

export interface Job<T = any> {
  id: string;
  data: T;
  timeoutMs?: number;
  createdAt: number;
  status: JobStatus;
  resolve: () => void;
  reject: (err: Error) => void;
}

export interface QueueOptions {
  concurrency?: number; // default = 1
  defaultTimeoutMs?: number;
}

export interface ManagerOptions {
  queueCount: number;
  timeoutMs?: number;
}
