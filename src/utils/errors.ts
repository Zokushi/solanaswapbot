export const ErrorCodes = {
  QUOTE_FETCH_ERROR: { code: 'QUOTE_FETCH_ERROR', description: 'Failed to fetch quote from API' },
  SWAP_EXECUTION_ERROR: { code: 'SWAP_EXECUTION_ERROR', description: 'Failed to execute swap transaction' },
  DB_ERROR: { code: 'DB_ERROR', description: 'Database operation failed' },
  WALLET_ERROR: { code: 'WALLET_ERROR', description: 'Wallet-related error' },
  TOKEN_ACCOUNT_ERROR: { code: 'TOKEN_ACCOUNT_ERROR', description: 'Error with token account' },
  INVALID_CONFIG: { code: 'INVALID_CONFIG', description: 'Invalid bot configuration' },
  API_ERROR: { code: 'API_ERROR', description: 'General API error' },
  BOT_INIT_ERROR: { code: 'BOT_INIT_ERROR', description: 'Failed to initialize bot' },
  BOT_STOP_ERROR: { code: 'BOT_STOP_ERROR', description: 'Failed to stop bot' },
  NOT_FOUND: { code: 'NOT_FOUND', description: 'Resource not found' },
  CONFIG_CREATION_FAILED: { code: 'CONFIG_CREATION_FAILED', description: 'Failed to create configuration' },
  CONFIG_UPDATE_FAILED: { code: 'CONFIG_UPDATE_FAILED', description: 'Failed to update configuration' },
  UNKNOWN_ERROR: { code: 'UNKNOWN_ERROR', description: 'Unexpected error' },
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]['code'];

export class TradeBotError<T = unknown> extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: T
  ) {
    super(message);
    this.name = 'TradeBotError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TradeBotError);
    }
  }

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