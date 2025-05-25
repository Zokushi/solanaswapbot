import { QuoteResponse, TradeBotConfig, NextTrade, BotData } from "./types.js";
import logger from "../utils/logger.js";
import {
  address,
  Address,
  createSolanaRpcSubscriptions,
  getAddressFromPublicKey,
  Rpc,
  SolanaRpcApiMainnet,
} from "@solana/kit";
import { getTokenDecimalsByAddress, getTokenName } from "../utils/helper.js";
import { Socket } from "socket.io-client";
import { TradeService } from "../services/tradeService.js";
import { NotificationService } from "../services/notificationService.js";
import { ConfigService } from "../services/configService.js";

export class TradeBot {
  // Public properties
  public readonly botId: bigint;
  public status: BotStatus;
  public difference: number;
  public ratio: number;
  public currentTrade: number;
  public inputTokenAccount: Address;
  public outputTokenAccount: Address;
  public firstTradePrice: number;
  public targetGainPercentage: number | undefined;
  public stopLossPercentage: bigint | undefined;
  public nextTrade: NextTrade;
  public tradeCounter: number;

  // Private properties
  private readonly wallet: CryptoKeyPair;
  private readonly rpc: Rpc<SolanaRpcApiMainnet>;
  private readonly subscriptions: ReturnType<typeof createSolanaRpcSubscriptions>;
  private readonly tradeService: TradeService;
  private readonly notificationService: NotificationService;
  private readonly socket: Socket;
  private priceWatchIntervalId?: NodeJS.Timeout;
  private readonly checkInterval: number;
  private lastCheck: number;
  private stopped: boolean;
  private waitingForConfirmation: boolean = false;
  public configService: ConfigService;

  constructor(config: TradeBotConfig, socket: Socket) {
    if (!config.rpc) {
      throw new Error('RPC client is required');
    }
    if (!config.subscriptions) {
      throw new Error('Subscriptions client is required');
    }

    this.botId = config.botId;
    this.wallet = config.wallet;
    this.rpc = config.rpc;
    this.subscriptions = config.subscriptions;
    this.socket = socket;
    this.difference = 0;
    this.ratio = 0;
    this.currentTrade = 0;
    this.status = "Running";
    this.targetGainPercentage = config.targetGainPercentage || undefined;
    this.inputTokenAccount = config.initialInputToken as Address;
    this.outputTokenAccount = config.initialOutputToken as Address;
    this.firstTradePrice = config.firstTradePrice;
    this.tradeCounter = 0;
    this.stopLossPercentage = config.stopLossPercentage || undefined;
    this.stopped = false;
    this.checkInterval = config.checkInterval || 20000;
    this.lastCheck = 0;

    this.nextTrade = {
      inputMint: config.initialInputToken as Address,
      outputMint: config.initialOutputToken as Address,
      amount: config.initialInputAmount,
      swapMode: "ExactIn",
    };

    this.tradeService = new TradeService(
      this.botId,
      this.wallet,
      this.rpc,
      this.subscriptions,
      this.postTransactionProcessing.bind(this),
      this.setWaitingForConfirmation.bind(this),
    );
    this.notificationService = new NotificationService();
    this.configService = new ConfigService();
    this.initialize().catch((error) => {
      this.socket.emit("log", { botId: this.botId.toString(), message: `Bot ID: FAILED TO START ${this.botId} Error: ${error}` });
    });
  }

  /**
   * Initializes the bot by fetching token accounts and starting the price watch.
   * @returns {Promise<void>}
   * @throws {Error} If public key fetching or balance refresh fails after retries.
   */
  private async initialize(): Promise<void> {
    this.notificationService.log(`Bot ID: ${this.botId.toString()} 🤖 Initiating trade bot`, Number(this.botId));

    const pubWallet = await getAddressFromPublicKey(this.wallet.publicKey);
    if (!pubWallet) {
      logger.error(`Bot ID: ${this.botId.toString()} - Error fetching public key.`);
      throw new Error("Error fetching public key. Make sure keypair provided is set and valid.");
    }
    this.startPriceWatch();
    this.emit("log", { botId: this.botId.toString(), message: `Bot ID: ${this.botId.toString()} started successfully` });
  }

  /**
   * Starts a periodic interval to monitor price changes and execute trades.
   * @private
   */
  private startPriceWatch(): void {
    this.priceWatchIntervalId = setInterval(async () => {
      if (this.stopped || !this.priceWatchIntervalId) {
        clearInterval(this.priceWatchIntervalId);
        this.priceWatchIntervalId = undefined;
        logger.debug(`Bot ID: ${this.botId.toString()} - Price watch stopped.`);
        return;
      }

      const currentTime = Date.now();
      if (currentTime - this.lastCheck < this.checkInterval) return;

      this.lastCheck = currentTime;

      if (this.waitingForConfirmation) {
        this.notificationService.log(`Bot ID: ${this.botId.toString()} - Waiting for transaction confirmation...`, Number(this.botId));
        return;
      }

      try {
        const timeout = setTimeout(() => {
          throw new Error("Quote fetch timed out");
        }, 10000);
        logger.debug(`Bot ID: ${this.botId.toString()} - calling getQuote()`);
        const quote = await this.tradeService.getQuote2(this.nextTrade);
        clearTimeout(timeout);
        if (quote) {
          await this.updateUI(quote);
          logger.debug(`Bot ID: ${this.botId.toString()} - Evaluating quote`);
          await this.tradeService.evaluateQuoteAndSwap(quote, this.firstTradePrice);
        }
      } catch (error) {
        const errorMsg = `Bot ID: ${this.botId.toString()} - Error in price watch: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        this.socket.emit("log", { botId: this.botId.toString(), message: errorMsg });
      }
    }, this.checkInterval);
  }

  /**
   * Sets the waiting for confirmation flag.
   * @param {boolean} flag - Whether the bot is waiting for transaction confirmation.
   * @public
   */
  public setWaitingForConfirmation(flag: boolean): void {
    logger.debug(`Bot ID: ${this.botId.toString()} - setWaitingForConfirmation(${flag})`);
    this.waitingForConfirmation = flag;
  }

  /**
   * Updates the UI with current price data and checks stop loss.
   * @param {QuoteResponse} quote - The latest quote response from the trade service.
   * @returns {Promise<void>}
   * @throws {Error} If token name or decimal conversion fails.
   * @private
   */
  private async updateUI(quote: QuoteResponse): Promise<void> {
    const currentPrice = parseInt(quote.outAmount);
    const thresholdPrice = this.firstTradePrice;

    const currentPriceWithDecimals = await getTokenDecimalsByAddress(
      this.nextTrade.outputMint as Address,
      currentPrice
    );
    const currentThresholdPrice = await getTokenDecimalsByAddress(this.nextTrade.outputMint as Address, thresholdPrice);
    logger.info(`Bot ID: ${this.botId.toString()} - updateUI() => Current Price=${currentPriceWithDecimals}, Threshold Price=${currentThresholdPrice}`);

    const diff = ((currentPriceWithDecimals - currentThresholdPrice) / currentThresholdPrice) * 100;
    this.difference = diff;
    this.currentTrade = currentPriceWithDecimals;

    if (this.stopLossPercentage && diff < -Number(this.stopLossPercentage)) {
      this.notificationService.log(`Bot ID: ${this.botId.toString()} - Stop loss triggered at ${currentPriceWithDecimals}. Terminating.`, Number(this.botId));
      this.terminateSession();
      return;
    }

    const inputName = await getTokenName(this.nextTrade.inputMint);
    const outputName = await getTokenName(this.nextTrade.outputMint);
    const botData: BotData = {
      botId: this.botId,
      status: this.stopped ? "Stopped" : "Running",
      inputMint: inputName,
      outputMint: outputName,
      currentPrice: this.currentTrade,
      targetTrade: currentThresholdPrice,
      difference: this.difference,
      trades: this.tradeCounter,
      tokenInPrice: 0,
      tokenOutPrice: 0
    };

    // Emit the bot data to update the dashboard
    this.emit('bot:difference', botData);
  }

  /**
   * Updates the next trade configuration based on the last trade result.
   * @param {QuoteResponse} lastTrade - The result of the last executed trade.
   * @returns {Promise<void>}
   * @throws {Error} If target gain percentage is invalid or calculation overflows.
   * @private
   */
  private async updateNextTrade(lastTrade: QuoteResponse): Promise<void> {
    const inLamports = BigInt(lastTrade.inAmount);
    if (!this.targetGainPercentage || this.targetGainPercentage <= 0) {
      throw new Error(`Bot ID: ${this.botId.toString()} - Invalid target gain percentage: ${this.targetGainPercentage}`);
    }

    const targetGainLamports = inLamports * BigInt(Math.floor(this.targetGainPercentage * 100)) / BigInt(10000);
    const currentGainLamports = BigInt(lastTrade.outAmount) - inLamports;

    if (currentGainLamports >= targetGainLamports) {
      this.notificationService.log(`Bot ID: ${this.botId.toString()} - Target gain reached! Stopping bot.`, Number(this.botId));
      this.terminateSession();
      return;
    }

    this.nextTrade = {
      inputMint: this.nextTrade.outputMint,
      outputMint: this.nextTrade.inputMint,
      amount: parseInt(lastTrade.outAmount),
      swapMode: "ExactIn",
    };
    this.firstTradePrice = Number(inLamports + targetGainLamports);
  }

  /**
   * Processes a completed transaction and updates bot state.
   * @param {QuoteResponse} quote - The quote response for the completed trade.
   * @param {string} txid - Transaction ID of the completed trade.
   * @returns {Promise<void>}
   * @throws {Error} If token decimal conversion or config update fails.
   * @public
   */
  public async postTransactionProcessing(quote: QuoteResponse, txid: string): Promise<void> {
    const { inputMint, inAmount, outputMint, outAmount } = quote;
    if (this.targetGainPercentage) {
      const priceChange = this.targetGainPercentage / 100;
      await this.updateNextTrade(quote);

      const getTokenA = await getTokenDecimalsByAddress(this.nextTrade.inputMint as Address, parseInt(quote.outAmount));
      const getTokenB = await getTokenDecimalsByAddress(this.nextTrade.outputMint as Address, parseInt(quote.inAmount) * (1 + priceChange));
      await this.configService.updateBotConfig(this.botId, {
        botId: this.botId,
        initialInputToken: await getTokenName(this.nextTrade.inputMint)!,
        initialOutputToken: await getTokenName(this.nextTrade.outputMint)!,
        initialInputAmount: Number(getTokenA)!,
        firstTradePrice: Number(getTokenB)!,
        targetGainPercentage: this.targetGainPercentage,
        stopLossPercentage: this.stopLossPercentage || BigInt(0),
      });
    }

    const logAmount = await getTokenDecimalsByAddress(inputMint as Address, parseFloat(inAmount));
    const logOutAmount = await getTokenDecimalsByAddress(outputMint as Address, parseFloat(outAmount));
    await this.notificationService.logSwap({
      botId: this.botId,
      tokenIn: address(inputMint),
      tokenInAmount: logAmount ?? 0,
      tokenInUSD: 0,
      tokenOut: address(outputMint),
      tokenOutAmount: logOutAmount ?? 0,
      tokenOutUSD: 0,
      totalValueUSD: 0,
      txid,
      date: new Date(),
    });

    this.tradeCounter += 1;
    this.notificationService.log(`Bot ID: ${this.botId.toString()} - Trade completed: Swapped ${await getTokenName(inputMint)} for ${await getTokenName(outputMint)}`, Number(this.botId));

    if (!this.targetGainPercentage || this.targetGainPercentage === 0) {
      this.socket.emit("log", {
        botId: this.botId.toString(),
        message: `Bot ID: ${this.botId.toString()} - No target gain percentage set. Stopping bot.`,
      });
      this.terminateSession();
    }
  }

  /**
   * Terminates the bot session and stops all operations.
   * @public
   */
  public terminateSession(): void {
    this.notificationService.log(`Bot ID: ${this.botId.toString()} ❌ Terminating bot...`, Number(this.botId));
    this.stopped = true;

    if (this.priceWatchIntervalId) {
      clearInterval(this.priceWatchIntervalId);
      this.priceWatchIntervalId = undefined;
    }
    this.notificationService.log(`Bot ID: ${this.botId.toString()} - Bot terminated successfully`, Number(this.botId));
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

  private emit(event: string, data: any) {
    this.socket.emit(event, this.serializeForSocket(data));
  }
}

// Add type for bot status
type BotStatus = "Running" | "Stopped";

export interface NewConfig {
  botId: bigint;
  // ...
  stopLossPercentage?: bigint; // undefined if not set
}