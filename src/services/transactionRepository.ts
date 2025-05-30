import prisma from '../utils/prismaClient.js';
import { TradeBotError, ErrorCodes } from '../utils/errors.js';
import { LogSwapArgs } from '../core/types.js';
import { createLogger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';

const logger = createLogger('TransactionRepository');

export class TransactionRepository {
  async createTransaction(data: LogSwapArgs) {
    try {
      const transaction = await prisma.transaction.create({ data });
      logger.info(`[TransactionRepository] Created transaction: ${JSON.stringify(transaction)}`);
      return transaction;
    } catch (error) {
      const err = new TradeBotError(
        `Error logging swap to DB: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.DB_ERROR.code,
        { botId: data.botId, txid: data.txid }
      );
      logger.error(err.message, err);
      throw err;
    } 
  }

  async getTransactions() {
    try {
      const transactions = await prisma.transaction.findMany({
        orderBy: {
          date: 'desc',
        },
      });
      return transactions;
    } catch (error) {
     handleError(error, 'Failed to fetch transactions', ErrorCodes.DB_ERROR.code)    
    }
  }
} 