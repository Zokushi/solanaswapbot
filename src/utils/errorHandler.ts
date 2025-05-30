// src/utils/errorHandler.ts
import { createLogger } from './logger.js';
import { TradeBotError, ErrorCode, ErrorCodes } from './errors.js';

/**
 * Error handler utility for the trading bot.
 * It standardizes error handling by creating a TradeBotError
 * and logging it with additional metadata.
 */
const logger = createLogger('ErrorHandler');

export function handleError<T>(
  error: unknown,
  defaultMessage: string,
  defaultCode: ErrorCode,
  metadata: Record<string, any> = {}
): never {
  const tradeBotError = error instanceof TradeBotError
    ? error
    : new TradeBotError(
        defaultMessage,
        defaultCode,
        { ...metadata, originalError: error instanceof Error ? error.message : String(error) }
      );
  logger.error(tradeBotError.message, { ...tradeBotError.toJSON(), metadata });
  throw tradeBotError;
}