# Turntable Queue Examples

This directory contains example applications demonstrating how to use Turntable Queue.

## Available Examples

### Client Integration

The [client-integration](./client-integration) example shows how to integrate the queue system with an existing application database schema. This example demonstrates:

- Adding the required queue models to your Prisma schema
- Using the queue with your existing Prisma client
- Implementing job processing for different types of jobs
- Using the queue in an Express web application

Each example is a standalone application with its own package.json, making it easy to run independently.

## Running Examples

Each example has its own README with specific instructions, but in general:

1. Navigate to the example directory
2. Install dependencies: `npm install`
3. Set up environment variables (usually by copying `.env-example` to `.env`)
4. Run the example: `npm start`

## Contributing

If you'd like to contribute additional examples, please:

1. Create a new directory with a descriptive name
2. Include a complete example with its own package.json
3. Provide a thorough README
4. Submit a pull request

We appreciate your contributions! 