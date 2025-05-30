import { Socket } from 'socket.io-client';
import { createLogger } from '../utils/logger.js';
import { getTransactions } from './transactionRepository.js';

const logger = createLogger('TransactionService');

export class TransactionService {

  constructor(
  ) {
  }

  public async handleGetTransactions(): Promise<any> {
    try {
      logger.info('Fetching transactions from repository');
      const transactions = await getTransactions();
      logger.info(`Retrieved ${transactions.length} transactions`);
      return { transactions };
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  public async broadcastTransactionUpdate(socket: Socket): Promise<void> {
    try {
      const transactions = await getTransactions();
      socket.emit('transactionUpdate', { transactions });
    } catch (error) {
      logger.error('Error broadcasting transaction update:', error);
    }
  }
} 