// src/services/notificationService.ts
import nodemailer from 'nodemailer';
import { BotData, LogSwapArgs } from '../core/types.js';
import dotenv from 'dotenv';
import { formatPrice, getTokenName } from '../utils/helper.js';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';
import { TradeBotError, ErrorCodes } from '../utils/error.js';
import { Socket } from 'socket.io-client';

dotenv.config({ path: '.env' });

export class NotificationService {
  constructor() { }

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
      
      // Emit the update to the socket
      if (socket) {
        socket.emit('bot:difference', message);
      }
    } catch (e) {
      logger.error('Error updating the UI:', e);
    }
  }

  async logSwap(args: LogSwapArgs): Promise<void> {
    const { botId, tokenIn, tokenInAmount, tokenOut, tokenOutAmount, txid } = args;
    const priceUSDInRecord = await this.getPrice(tokenIn);
    const priceUSDOutRecord = await this.getPrice(tokenOut);
    const priceUSDIn = priceUSDInRecord[tokenIn];
    const priceUSDOut = priceUSDOutRecord[tokenOut];
    const updatedMint = await getTokenName(tokenIn);
    const updatedMintOut = await getTokenName(tokenOut);

    try {
      await prisma.transaction.create({
        data: {
          botId,
          tokenIn: updatedMint || tokenIn,
          tokenInAmount,
          tokenOut: updatedMintOut || tokenOut,
          tokenOutAmount,
          tokenInUSD: Number(priceUSDIn),
          tokenOutUSD: Number(priceUSDOut),
          totalValueUSD: Number(priceUSDIn) * Number(tokenInAmount),
          txid,
        },
      });
      logger.info(`[Bot ${botId}] Logged swap to DB: ${tokenInAmount} ${tokenIn} -> ${tokenOutAmount} ${tokenOut}, TX: ${txid}`);
    } catch (error) {
      const err = new TradeBotError(
        `Error logging swap to DB: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.DB_ERROR,
        { botId, txid }
      );
      logger.error(err.message, err);
      throw err;
    } finally {
      await prisma.$disconnect();
    }
  }

  public async getPrice(mints: string): Promise<Record<string, number>> {
    if (mints.length === 0) {
      throw new TradeBotError('No mint addresses provided', ErrorCodes.INVALID_CONFIG);
    }

    const query = mints;
    const url = `https://lite-api.jup.ag/price/v2?ids=${query}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response) {
        throw new TradeBotError('Invalid response from price API', ErrorCodes.API_ERROR, { url });
      }

      const prices: Record<string, number> = {};
      const json = await response.json() as Record<string, { price: number }>;
      if (json[mints]) {
        prices[mints] = json[mints].price;
      } else {
        logger.warn(`Price for mint '${mints}' not found.`);
      }

      logger.info(`[TradeService] Fetched prices: ${JSON.stringify(prices)}`);
      return prices;
    } catch (error) {
      const err = new TradeBotError(
        `Failed to fetch prices: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.API_ERROR,
        { mints }
      );
      logger.error(err.message, err);
      throw err;
    }
  }
}