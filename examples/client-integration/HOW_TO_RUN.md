# How to Run the Example

This guide will help you run the turntable-queue client integration example with a Supabase PostgreSQL database.

## Prerequisites

- Node.js 14+ installed
- NPM or Yarn package manager
- Access to the Supabase database (credentials are already provided)

## Quick Start (Windows)

For Windows users, we've provided a batch file that handles everything automatically:

1. Simply double-click `run.bat` or run it from the command line:
   ```
   run.bat
   ```

This will set up the environment, build the library, install dependencies, push the schema to the database, and start the application.

## Manual Setup (Any Platform)

If you prefer to run the commands manually, follow these steps:

### Step 1: Set up environment variables

```bash
node create-env.js
```

This creates a `.env` file with the Supabase connection strings.

### Step 2: Build the main library

```bash
# Go to the root directory
cd ../..
npm install
npm run build
cd examples/client-integration
```

### Step 3: Set up the example

```bash
npm install
npx prisma generate
npx prisma db push
```

### Step 4: Seed the database

```bash
npx ts-node setup-db.ts
```

### Step 5: Start the application

```bash
npm start
```

## Testing the API

When the application is running, you can test it using curl commands. The setup script will provide you with a ready-to-use curl command with valid user and product IDs.

Example:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-id-here","items":[{"productId":"product-id-here","quantity":2}]}'
```

## Troubleshooting

If you encounter any issues:

1. Make sure your `.env` file contains the correct Supabase connection strings
2. Check that Prisma is correctly generating the client with `npx prisma generate`
3. Verify that the schema is pushed to the database with `npx prisma db push`
4. If you make changes to the schema, you might need to run `npx prisma generate` again

## Database Schema

This example uses a PostgreSQL database with the following models:
- User: Represents customers
- Product: Products available for purchase
- Order: Orders placed by users
- OrderItem: Items included in an order
- Job: Queue jobs (required by turntable-queue) 