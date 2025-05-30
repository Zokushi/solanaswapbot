
import { JupiterPriceResponse } from '../core/types.js';
import { createLogger } from '../utils/logger.js';
import { ErrorCodes, TradeBotError } from '../utils/errors.js';

const logger = createLogger('PriceService');

export async function getPrice(mint: string): Promise<Record<string, number>> {
  if (mint.length === 0) {
    throw new TradeBotError('No mint addresses provided', ErrorCodes.INVALID_CONFIG.code);
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

    const priceValue = Number(data.data[mint].price);
    if (
      data.data &&
      data.data[mint] &&
      !isNaN(priceValue)
    ) {
      prices[mint] = priceValue;
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