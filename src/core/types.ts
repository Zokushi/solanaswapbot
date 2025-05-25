import { RoutePlanStep} from "@jup-ag/api";
import { Address, Rpc, createSolanaRpcSubscriptions, SolanaRpcApiMainnet } from "@solana/kit";

// Utility type for BigInt values that can be safely converted to/from numbers
export type SafeBigInt = bigint;

// Utility type for percentage values (0-100) stored as BigInt
export type PercentageBigInt = SafeBigInt;

// Utility functions for handling BigInt values
export const BigIntUtils = {
  // Convert a number to BigInt, handling decimal places
  fromNumber: (value: number, decimals: number = 0): SafeBigInt => {
    const multiplier = Math.pow(10, decimals);
    return BigInt(Math.floor(value * multiplier));
  },

  // Convert a BigInt back to a number, handling decimal places
  toNumber: (value: SafeBigInt, decimals: number = 0): number => {
    const divisor = Math.pow(10, decimals);
    return Number(value) / divisor;
  },

  // Convert a percentage (0-100) to BigInt
  fromPercentage: (percentage: number): PercentageBigInt => {
    return BigInt(Math.floor(percentage * 100)); // Store as basis points (1% = 100)
  },

  // Convert a BigInt percentage back to a number
  toPercentage: (value: PercentageBigInt): number => {
    return Number(value) / 100; // Convert from basis points
  },

  // Safe division of BigInt by number
  divide: (value: SafeBigInt, divisor: number): SafeBigInt => {
    return value / BigInt(Math.floor(divisor));
  },

  // Safe multiplication of BigInt by number
  multiply: (value: SafeBigInt, multiplier: number): SafeBigInt => {
    return value * BigInt(Math.floor(multiplier));
  }
};

export interface NewConfig {
  botId: SafeBigInt | number;
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  firstTradePrice: number;
  targetGainPercentage: number;
  stopLossPercentage?: SafeBigInt;
}

export interface BotData {
  botId: SafeBigInt;
  status: string;
  balance?: number;
  inputMint: string;
  outputMint: string;
  targetTrade: number;
  difference?: number;
  tokenInPrice?: number;
  tokenOutPrice?: number;
  currentPrice: number;
  targetGainPercentage?: number;
  inBalance?: number;
  outBalance?: number;
  trades?: number;
  ratio?: number;
}

export interface TokenAccountInfo {
  pubkey: string;
  mint: string;
  balance: number;
}

export interface LogSwapArgs {
  botId: SafeBigInt;
  tokenIn: string;
  tokenInAmount: number;
  tokenOut: string;
  tokenOutAmount: number;
  tokenInUSD: number;
  tokenOutUSD: number;
  totalValueUSD: number;
  txid: string;
  date: Date;
}

export interface EmailArgs {
  subject: string;
  text: string;
}

export interface TradeBotConfig {
  botId: bigint;
  wallet: CryptoKeyPair;
  rpc: Rpc<SolanaRpcApiMainnet>;
  subscriptions?: ReturnType<typeof createSolanaRpcSubscriptions>;
  firstTradePrice: number;
  stopLossPercentage?: PercentageBigInt;
  targetGainPercentage: number;
  checkInterval?: number;
  initialInputToken: string;
  initialInputAmount: number;
  initialOutputToken: string;
}

export interface MultiBotConfig {
  botId: bigint;
  wallet: CryptoKeyPair;
  rpc: Rpc<SolanaRpcApiMainnet>;
  subscriptions: ReturnType<typeof createSolanaRpcSubscriptions>;
  initialInputToken?: string;
  initialInputAmount?: number;
  initialBalance?: number;
  targetAmounts?: Record<string, number>;
  targetGainPercentage?: number;
  stopLossPercentage?: PercentageBigInt;
  checkInterval?: number;
}

export interface targetAmounts {
  outputMint: Address;
  amount: number;
}


// Extend the price target to QuoteGetRequest
export interface NextTrade extends QuoteGetRequest { }

declare const SwapMode: {
  readonly ExactIn: "ExactIn";
  readonly ExactOut: "ExactOut";
};
type SwapMode = (typeof SwapMode)[keyof typeof SwapMode];
export type PriorityLevel = "low" | "medium" | "high" | "very high";

interface QuoteGetRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  autoSlippage?: boolean;
  maxAutoSlippageBps?: number;
  swapMode?: string;
  dexes?: Array<string>;
  excludeDexes?: Array<string>;
  restrictIntermediateTokens?: boolean;
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  platformFeeBps?: number;
  maxAccounts?: number;
  prioritizationFeeLamports?: {
    priorityLevelWithMaxLamports: {
      maxLamports: number;
      priorityLevel: PriorityLevel;
    };
  };
}

interface LogEntry {
  level: 'info' | 'error' | 'warn';
  timestamp: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
}


interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: SwapMode;
  slippageBps: number;
  feeAccount?: string;
  autoSlippage?: boolean;
  maxAutoSlippageBps?: number;
  platformFee?: {
    amount: string;
    feeBps: number
  }
  priceImpactPct: string;
  routePlan: Array<RoutePlanStep>;
  contextSlot?: number;
  timeTaken?: number;
}

interface QuicknodeConfig {
  endpoint: string;
  jupiterApi?: string;
  wssEndpoint?: string;
  computeMargin?: number;
}

interface QuicknodeRpcConfig {
  wssEndpoint: string;
}

interface CreateAddonsApiParams {
  endpoint: string;
  jupiterApi?: string;
}


export type {
  QuoteGetRequest,
  QuoteResponse,
  QuicknodeConfig,
  QuicknodeRpcConfig,
  CreateAddonsApiParams,
  LogEntry,
};
export interface Tags {
  verified?: string;
  unverified?: string;
  lst?: string;
  strict?: string;
  community?: string;
  pump?: string;
  clone?: string;
};

export type TokenInfo = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}