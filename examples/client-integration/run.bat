@echo off
echo Setting up and running turntable-queue client integration example...
echo.

cd ..\..
echo Step 1: Building the main turntable-queue library...
call npm install
call npm run build
echo Library built successfully!
echo.

cd examples\client-integration
echo Step 2: Setting up the client integration example...
call node create-env.js
call npm install
call npx prisma generate
call npx prisma db push
call npx ts-node setup-db.ts
echo.

echo Step 3: Starting the application...
call npm start
pause 