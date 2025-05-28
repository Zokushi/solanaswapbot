import prisma from '../utils/prismaClient.js';
import { TradeBotError, ErrorCodes } from '../utils/error.js';
import logger from '../utils/logger.js';

export class TransactionRepository {
  async createTransaction(data: {
    botId: string;
    tokenIn: string;
    tokenInAmount: number;
    tokenOut: string;
    tokenOutAmount: number;
    tokenInUSD: number;
    tokenOutUSD: number;
    totalValueUSD: number;
    txid: string;
  }) {
    try {
      const transaction = await prisma.transaction.create({ data });
      logger.info(`[TransactionRepository] Created transaction: ${JSON.stringify(transaction)}`);
      return transaction;
    } catch (error) {
      const err = new TradeBotError(
        `Error logging swap to DB: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.DB_ERROR,
        { botId: data.botId, txid: data.txid }
      );
      logger.error(err.message, err);
      throw err;
    } finally {
      await prisma.$disconnect();
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
      const err = new TradeBotError(
        `Error fetching transactions: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.DB_ERROR
      );
      logger.error(err.message, err);
      throw err;
    } finally {
      await prisma.$disconnect();
    }
  }
} 