import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  // Create a new Prisma client
  const prisma = new PrismaClient();

  try {
    console.log('Creating sample data...');

    // Create a sample user
    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
      },
    });

    console.log(`Created user: ${user.name} (${user.id})`);

    // Create some sample products
    const products = await Promise.all([
      prisma.product.create({
        data: {
          name: 'Product A',
          description: 'This is product A',
          price: 19.99,
          stock: 100,
        },
      }),
      prisma.product.create({
        data: {
          name: 'Product B',
          description: 'This is product B',
          price: 29.99,
          stock: 50,
        },
      }),
      prisma.product.create({
        data: {
          name: 'Product C',
          description: 'This is product C',
          price: 39.99,
          stock: 25,
        },
      }),
    ]);

    console.log(`Created ${products.length} products`);
    products.forEach(product => {
      console.log(`- ${product.name}: $${product.price} (ID: ${product.id})`);
    });

    console.log('\nSample data created successfully!');
    console.log('\nTo test the application:');
    console.log('1. Run "npm start" to start the server');
    console.log('2. Create an order using:');
    console.log(`   curl -X POST http://localhost:3000/orders \\
    -H "Content-Type: application/json" \\
    -d '{"userId":"${user.id}","items":[{"productId":"${products[0].id}","quantity":2}]}'`);

  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    // Disconnect from the database
    await prisma.$disconnect();
  }
}

// Run the main function
main().catch(error => {
  console.error(error);
  process.exit(1);
}); 