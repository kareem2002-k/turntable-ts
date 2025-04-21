const fs = require('fs');
const path = require('path');

// The content for the .env file
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

// Write the .env file
const envPath = path.join(__dirname, '.env');
fs.writeFileSync(envPath, envContent);

console.log('.env file created successfully at:', envPath);
console.log('Environment variables are now set up for Supabase PostgreSQL.'); 