declare module '@prisma/client' {
  export class PrismaClient {
    constructor(options?: any);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T>;
    $transaction<T>(queries: any[]): Promise<T[]>;
    
    user: any;
    product: any;
    order: any;
    orderItem: any;
    job: any;
  }
}

declare module 'turntable-queue' {
  interface QueueStats {
    queueId: number;
    length: number;
    running: number;
    maxConcurrency: number;
    isActive: boolean;
  }

  export class QueueManager<T = any> {
    constructor(options: any);
    addJob(data: T): Promise<string>;
    completeJob(jobId: string): void;
    failJob(jobId: string, error?: Error): void;
    on(event: string, handler: (data: any) => void): void;
    shutdown(): Promise<void>;
    getStats(): QueueStats[];
    getQueues(): any[];
  }
  
  export class PersistentQueueManager<T = any> extends QueueManager<T> {
    constructor(options: any);
    getPrismaClient(): any;
  }
  
  export function createQueueApiRoutes(queueManager: QueueManager, options?: any): any;
}

declare module 'nodemailer' {
  export function createTransport(options: any): any;
} 