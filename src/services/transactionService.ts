import { Socket } from 'socket.io-client';
import { TransactionRepository } from './transactionRepository.js';
import logger from '../utils/logger.js';

export class TransactionService {
  private transactionRepo: TransactionRepository;

  constructor(
    transactionRepo: TransactionRepository = new TransactionRepository()
  ) {
    this.transactionRepo = transactionRepo;
  }

  public async handleGetTransactions(): Promise<any> {
    try {
      logger.info('Fetching transactions from repository');
      const transactions = await this.transactionRepo.getTransactions();
      logger.info(`Retrieved ${transactions.length} transactions`);
      return { transactions };
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  public async broadcastTransactionUpdate(socket: Socket): Promise<void> {
    try {
      const transactions = await this.transactionRepo.getTransactions();
      socket.emit('transactionUpdate', { transactions });
    } catch (error) {
      logger.error('Error broadcasting transaction update:', error);
    }
  }
} 