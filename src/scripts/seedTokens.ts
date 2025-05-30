import { fetchTokenList } from '../services/tokenDataService.js';
import prisma from '../utils/prismaClient.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SeedTokensScript');

async function seedTokens() {
  try {
    logger.info('Starting token database seeding...');
    
    // Check if we have any tokens in the database
    const existingTokens = await prisma.token.findMany({
      take: 1
    });

    if (existingTokens.length === 0) {
      logger.info('No tokens found in database, fetching from Jupiter API...');
      await fetchTokenList();
    } else {
      logger.info('Tokens already exist in database, skipping fetch...');
    }

    logger.info('Token database seeding completed successfully');
  } catch (error) {
    logger.error(`Failed to seed token database: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTokens(); 