#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Setting up turntable-queue client integration example...');

// Step 1: Create the .env file
console.log('\n---------------------------------------------');
console.log('Step 1: Creating .env file with Supabase connection info');

const envContent = `# Connect to Supabase via connection pooling
DATABASE_URL="postgresql://postgres.xkebtspnuaipnhrsaqdm:GLiSrbLN2W1a7kdd@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection to the database. Used for migrations
DIRECT_URL="postgresql://postgres.xkebtspnuaipnhrsaqdm:GLiSrbLN2W1a7kdd@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# App settings
PORT=3000

# SMTP settings (for email notifications) - mock values for demo
SMTP_USER="your-email@example.com"
SMTP_PASS="your-email-password"
`;

const envPath = path.join(__dirname, '.env');
fs.writeFileSync(envPath, envContent);
console.log('✅ .env file created successfully');

// Step 2: Build the main library
console.log('\n---------------------------------------------');
console.log('Step 2: Building the main turntable-queue library');
try {
  // Go up two directories to the root of the project
  process.chdir(path.join(__dirname, '..', '..'));
  console.log('Installing dependencies for the main library...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('Building the library...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Library built successfully');
  
  // Go back to the example directory
  process.chdir(path.join(__dirname));
} catch (error) {
  console.error('❌ Error building the library:', error.message);
  process.exit(1);
}

// Step 3: Install dependencies for the example
console.log('\n---------------------------------------------');
console.log('Step 3: Installing dependencies for the example');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Error installing dependencies:', error.message);
  process.exit(1);
}

// Step 4: Push the database schema
console.log('\n---------------------------------------------');
console.log('Step 4: Setting up the database schema');
try {
  execSync('npx prisma db push', { stdio: 'inherit' });
  console.log('✅ Database schema pushed successfully');
} catch (error) {
  console.error('❌ Error pushing database schema:', error.message);
  process.exit(1);
}

// Step 5: Seed the database with sample data
console.log('\n---------------------------------------------');
console.log('Step 5: Seeding the database with sample data');
try {
  execSync('npx ts-node setup-db.ts', { stdio: 'inherit' });
  console.log('✅ Database seeded successfully');
} catch (error) {
  console.error('❌ Error seeding the database:', error.message);
  process.exit(1);
}

console.log('\n---------------------------------------------');
console.log('✅ Setup completed successfully!');
console.log('\nTo run the example:');
console.log('  npm start');
console.log('\nThis will start the server on http://localhost:3000');
console.log('Use the curl command from the setup output to create a sample order.');
console.log('---------------------------------------------'); 