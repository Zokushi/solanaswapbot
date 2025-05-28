import fetch from 'node-fetch';
import { TradeBotError, ErrorCodes } from '../utils/error.js';
import logger from '../utils/logger.js';

interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      price: number;
    };
  };
}

export class PriceService {
  async getPrice(mint: string): Promise<Record<string, number>> {
    if (mint.length === 0) {
      throw new TradeBotError('No mint addresses provided', ErrorCodes.INVALID_CONFIG);
    }

    try {
      const response = await fetch(`https://lite-api.jup.ag/price/v2?ids=${mint}`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        logger.warn(`[PriceService] Invalid response from price API for mint ${mint}`);
        return { [mint]: 0 };
      }

      const data = await response.json() as JupiterPriceResponse;
      const prices: Record<string, number> = {};
      
      if (data.data && data.data[mint] && typeof data.data[mint].price === 'number' && !isNaN(data.data[mint].price)) {
        prices[mint] = data.data[mint].price;
      } else {
        logger.warn(`[PriceService] Price for mint '${mint}' not found or invalid.`);
        prices[mint] = 0;
      }

      logger.info(`[PriceService] Fetched prices: ${JSON.stringify(prices)}`);
      return prices;
    } catch (error) {
      logger.warn(`[PriceService] Failed to fetch price for mint ${mint}: ${error instanceof Error ? error.message : String(error)}`);
      return { [mint]: 0 };
    }
  }
} 