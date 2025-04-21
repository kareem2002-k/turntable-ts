# Turntable Queue System with Prisma and Supabase Persistence

A robust, scalable job queue system with built-in persistence via Prisma and Supabase.

## Features

- **Distributed Queue System**: Handle jobs across multiple threads
- **Persistence**: Store jobs in Supabase PostgreSQL to survive restarts
- **Automatic Recovery**: Automatically recover failed or interrupted jobs
- **Batch Processing**: Efficient database operations with batching
- **Scaling Support**: Seamlessly scale up or down the number of queues
- **REST API Integration**: Easy-to-use API endpoints
- **Monitoring**: View queue stats and health

## Quick Start

### Using Docker (Recommended)

1. Clone the repository
2. Create a `.env` file based on `.env.example`
3. Run with Docker Compose:

```bash
docker-compose up -d
```

### Manual Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and get your connection details
4. Create a `.env` file based on `.env.example` with your Supabase connection
5. Generate Prisma client:

```bash
npx prisma generate
```

6. Run migrations:

```bash
npx prisma migrate dev --name init
```

7. Start the server:

```bash
npm run dev
```

## Configuration

Configuration is managed through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `QUEUE_COUNT` | Number of parallel queues/threads | 3 |
| `QUEUE_CONCURRENCY` | Jobs processed concurrently per queue | 1 |
| `QUEUE_TIMEOUT_MS` | Default job timeout (milliseconds) | 60000 |
| `PERSISTENCE_ENABLED` | Enable/disable persistence | true |
| `PERSISTENCE_BATCH_SIZE` | Number of jobs in a batch operation | 100 |
| `DATABASE_URL` | Supabase PostgreSQL connection string | - |

## API Endpoints

The system exposes the following API endpoints:

### Adding a Job

```http
POST /api/tasks
```

Request body:
```json
{
  "payload": {
    "task": "example-task",
    "data": { "key": "value" }
  },
  "priority": "normal",
  "customTimeout": 120000
}
```

### Monitoring Queue Status

```http
GET /api/status
```

### Cleaning Up Old Jobs

```http
POST /api/jobs/cleanup
```

Request body:
```json
{
  "ageInDays": 7
}
```

## Scaling

The queue system automatically handles scaling up or down:

```typescript
// To add more queues:
await queueManager.updateQueueCount(5);

// To decrease queue count:
await queueManager.updateQueueCount(2);
```

When decreasing the queue count, pending jobs are automatically redistributed to remaining queues.

## Recovery

The system automatically recovers:
- On startup, loading any pending jobs from the database
- When a queue is removed, redistributing its jobs
- If the server crashed, automatically restarting pending jobs

## Best Practices

1. **Use Docker Compose**: For consistent environment setup
2. **Adjust Batch Size**: Tune `PERSISTENCE_BATCH_SIZE` based on your load
3. **Configure Concurrency**: Set appropriate `QUEUE_CONCURRENCY` for your workload
4. **Set Appropriate Timeouts**: Configure job timeouts to avoid stalled jobs
5. **Run Cleanup Regularly**: Use the cleanup endpoint to remove old completed jobs

## License

MIT 
