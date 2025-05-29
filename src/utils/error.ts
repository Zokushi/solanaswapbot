// src/utils/errors.ts

import logger from "./logger.js";

export class TradeBotError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TradeBotError';
    // Ensure the stack trace is captured correctly
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TradeBotError);
    }
  }

  // Utility to convert the error to a serializable object for logging or Socket.IO
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}

// Common error codes for consistency
export const ErrorCodes = {
  QUOTE_FETCH_ERROR: 'QUOTE_FETCH_ERROR',
  SWAP_EXECUTION_ERROR: 'SWAP_EXECUTION_ERROR',
  DB_ERROR: 'DB_ERROR',
  WALLET_ERROR: 'WALLET_ERROR',
  TOKEN_ACCOUNT_ERROR: 'TOKEN_ACCOUNT_ERROR',
  INVALID_CONFIG: 'INVALID_CONFIG',
  API_ERROR: 'API_ERROR',
  BOT_INIT_ERROR: 'BOT_INIT_ERROR',
  BOT_STOP_ERROR: 'BOT_STOP_ERROR',
  NOT_FOUND: 'NOT_FOUND',
} as const;

// Centralized error logging function
export function logError(error: unknown, context?: string): TradeBotError {
  let tradeBotError: TradeBotError;

  if (error instanceof TradeBotError) {
    tradeBotError = error;
  } else if (error instanceof Error) {
    tradeBotError = new TradeBotError(
      `Unexpected error: ${error.message}`,
      'UNKNOWN_ERROR',
      { context, originalError: error.message }
    );
  } else {
    tradeBotError = new TradeBotError(
      `Unexpected error: ${String(error)}`,
      'UNKNOWN_ERROR',
      { context, originalError: error }
    );
  }

  logger.error(`[${context || 'Unknown'}] ${tradeBotError.message}`, tradeBotError);
  return tradeBotError;

}