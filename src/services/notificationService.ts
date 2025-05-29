// src/services/notificationService.ts
import { Socket } from 'socket.io-client';
import { BotData, LogSwapArgs } from '../core/types.js';
import { formatPrice } from '../utils/helper.js';
import logger from '../utils/logger.js';
import getPrice from './getPrice.js';
import { TransactionRepository } from './transactionRepository.js';

export class NotificationService {
  private transactionRepo: TransactionRepository;

  constructor(
    transactionRepo: TransactionRepository = new TransactionRepository()
  ) {
    this.transactionRepo = transactionRepo;
  }

  private serializeForSocket(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    if (typeof data === 'bigint') {
      return data.toString();
    }
    
    if (Array.isArray(data)) {
      return data.map(this.serializeForSocket.bind(this));
    }
    
    if (typeof data === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.serializeForSocket(value);
      }
      return result;
    }
    
    return data;
  }

  public emit(socket: Socket, event: string, data: any): void {
    if (socket) {
      socket.emit(event, this.serializeForSocket(data));
    }
  }

  public log(message: string, botId: string) {
    logger.info(`[Bot ${botId}] ${message}`);
  }

  async difference(socket: Socket, botData: BotData): Promise<void> {
    try {
      const { botId, inputMint, tokenInPrice, outputMint, tokenOutPrice, currentPrice, targetTrade } = botData;

      const ratio = tokenInPrice && tokenOutPrice ? (tokenInPrice / tokenOutPrice).toFixed(2) : '0';
      const differenceValue = ((targetTrade - currentPrice) / targetTrade) * 100;

      const message = {
        botId: botId.toString(),
        status: 'Running',
        inputMint,
        priceIn: formatPrice(tokenInPrice ?? 0),
        outputMint,
        priceOut: formatPrice(tokenOutPrice ?? 0),
        currentTrade: currentPrice ?? 0,
        targetTrade: targetTrade ?? 0,
        difference: differenceValue,
        ratio: Number(ratio),
        trades: 0
      };

      logger.info(`[Bot ${botId.toString()}] Difference Update: ${JSON.stringify(message)}`);
      
      if (socket) {
        socket.emit('bot:difference', message);
      }
    } catch (e) {
      logger.error('Error updating the UI:', e);
    }
  }

  async logSwap(args: LogSwapArgs): Promise<void> {
    const { botId, tokenIn, tokenInAmount, tokenOut, tokenOutAmount, txid } = args;
    
    try {
      const priceUSDIn = await getPrice(tokenIn);
      const priceUSDOut = await getPrice(tokenOut);

      const tokenInUSD = priceUSDIn[tokenIn] ? Number(priceUSDIn[tokenIn]) : 0;
      const tokenOutUSD = priceUSDOut[tokenOut] ? Number(priceUSDOut[tokenOut]) : 0;
      const totalValueUSD = tokenInUSD * Number(tokenInAmount);

      await this.transactionRepo.createTransaction({
        botId,
        tokenIn,
        tokenInAmount,
        tokenOut,
        tokenOutAmount,
        tokenInUSD: tokenInUSD,
        tokenOutUSD: tokenOutUSD,
        totalValueUSD,
        txid,
        date: new Date()
      });

      logger.info(`[Bot ${botId}] Logged swap: ${tokenInAmount} ${tokenIn} -> ${tokenOutAmount} ${tokenOut}, TX: ${txid}`);
    } catch (error) {
      logger.error(`[Bot ${botId}] Error logging swap:`, error);
      throw error;
    }
  }
}