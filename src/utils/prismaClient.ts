import { PrismaClient } from "@prisma/client";
import { createLogger } from "./logger.js";
import path from "path";
import { fileURLToPath } from "url";

const logger = createLogger("PrismaClient");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a single instance
const prisma = new PrismaClient({
  log: ['error', 'warn'], // Reduce logging in production
  datasources: {
    db: {
      url: `file:${path.join(__dirname, '../../prisma/dev.db')}`
    }
  }
});

// Test the connection
prisma.$connect()
  .then(() => {
    logger.info('Successfully connected to the database');
  })
  .catch((error) => {
    logger.error('Failed to connect to the database:', error);
  });

// Handle cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
