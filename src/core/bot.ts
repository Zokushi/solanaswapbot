import { QuoteResponse, TradeBotConfig, NextTrade, BotData, BotStatus } from "./types.js";
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
  public readonly botId: string;
  public status: BotStatus = 'inactive';
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
  private monitorInterval?: NodeJS.Timeout;

  constructor(config: TradeBotConfig, socket: Socket) {
    if (!config.rpc) {
      throw new Error('RPC client is required');
    }
    if (!config.subscriptions) {
      throw new Error('Subscriptions client is required');
    }

    this.botId = config.botId.toString();
    this.wallet = config.wallet;
    this.rpc = config.rpc;
    this.subscriptions = config.subscriptions;
    this.socket = socket;
    this.difference = 0;
    this.ratio = 0;
    this.currentTrade = 0;
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
      logger.error(`Bot ID: ${this.botId} - Error starting bot: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /**
   * Initializes the bot by fetching token accounts and starting the price watch.
   * @returns {Promise<void>}
   * @throws {Error} If public key fetching or balance refresh fails after retries.
   */
  private async initialize(): Promise<void> {
    this.notificationService.log(`Bot ID: ${this.botId} 🤖 Initiating trade bot`, this.botId);

    const pubWallet = await getAddressFromPublicKey(this.wallet.publicKey);
    if (!pubWallet) {
      logger.error(`Bot ID: ${this.botId} - Error fetching public key.`);
      throw new Error("Error fetching public key. Make sure keypair provided is set and valid.");
    }
    this.startPriceWatch();
    logger.info(`${this.botId} started successfully`);
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
        logger.info(`Bot ID: ${this.botId} - Price watch stopped.`);
        return;
      }

      const currentTime = Date.now();
      if (currentTime - this.lastCheck < this.checkInterval) return;

      this.lastCheck = currentTime;

      if (this.waitingForConfirmation) {
        logger.info(`Bot ID: ${this.botId} - Waiting for transaction confirmation...`);
        return;
      }

      try {
        const timeout = setTimeout(() => {
          throw new Error("Quote fetch timed out");
        }, 10000);
        logger.debug(`Bot ID: ${this.botId} - calling getQuote()`);
        const quote = await this.tradeService.getQuote2(this.nextTrade);
        clearTimeout(timeout);
        if (quote) {
          await this.updateUI(quote);
          logger.debug(`Bot ID: ${this.botId} - Evaluating quote`);
          await this.tradeService.evaluateQuoteAndSwap(quote, this.firstTradePrice);
        }
      } catch (error) {
        const errorMsg = `Bot ID: ${this.botId} - Error in price watch: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
      }
    }, this.checkInterval);
  }

  /**
   * Sets the waiting for confirmation flag.
   * @param {boolean} flag - Whether the bot is waiting for transaction confirmation.
   * @public
   */
  public setWaitingForConfirmation(flag: boolean): void {
    logger.debug(`Bot ID: ${this.botId} - setWaitingForConfirmation(${flag})`);
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
    logger.info(`Bot ID: ${this.botId} - updateUI() => Current Price=${currentPriceWithDecimals}, Threshold Price=${currentThresholdPrice}`);

    const diff = ((currentPriceWithDecimals - currentThresholdPrice) / currentThresholdPrice) * 100;
    this.difference = diff;
    this.currentTrade = currentPriceWithDecimals;

    if (this.stopLossPercentage && diff < -Number(this.stopLossPercentage)) {
      this.notificationService.log(`Bot ID: ${this.botId} - Stop loss triggered at ${currentPriceWithDecimals}. Terminating.`, this.botId);
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
      throw new Error(`Bot ID: ${this.botId} - Invalid target gain percentage: ${this.targetGainPercentage}`);
    }

    const targetGainLamports = inLamports * BigInt(Math.floor(this.targetGainPercentage * 100)) / BigInt(10000);
    const currentGainLamports = BigInt(lastTrade.outAmount) - inLamports;

    if (currentGainLamports >= targetGainLamports) {
      this.notificationService.log(`Bot ID: ${this.botId} - Target gain reached! Stopping bot.`, this.botId);
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
        stopLossPercentage: this.stopLossPercentage ? Number(this.stopLossPercentage) : null,
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
    logger.info(`Bot ID: ${this.botId} - Trade completed: Swapped ${await getTokenName(inputMint)} for ${await getTokenName(outputMint)}`);

    if (!this.targetGainPercentage || this.targetGainPercentage === 0) {
      logger.info(`${this.botId} - No target gain percentage set. Stopping bot.`);
      this.terminateSession();
    }
  }

  /**
   * Terminates the bot session and stops all operations.
   * @public
   */
  public terminateSession(): void {
    this.notificationService.log(`Bot ID: ${this.botId} ❌ Terminating bot...`, this.botId);
    this.stopped = true;

    if (this.priceWatchIntervalId) {
      clearInterval(this.priceWatchIntervalId);
      this.priceWatchIntervalId = undefined;
    }
    this.notificationService.log(`Bot ID: ${this.botId} - Bot terminated successfully`, this.botId);
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

  async start(): Promise<void> {
    if (this.status === 'Running') {
      throw new Error('Bot is already running');
    }

    if (!this.inputTokenAccount || !this.nextTrade.amount) {
      throw new Error('Missing required configuration: initialInputToken or initialInputAmount');
    }

    try {
      this.status = 'Running';
      this.socket.emit('botStatus', { botId: this.botId, status: this.status });
      
      this.monitorInterval = setInterval(async () => {
        try {
          await this.checkAndExecute();
        } catch (error) {
          logger.error(`Error in monitor interval: ${error}`);
          this.socket.emit('error', { 
            botId: this.botId, 
            message: `Monitor error: ${error instanceof Error ? error.message : String(error)}` 
          });
        }
      }, this.checkInterval || 60000);
    } catch (error) {
      this.status = 'Stopped';
      this.socket.emit('botStatus', { botId: this.botId, status: this.status });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.status !== 'Running') {
      throw new Error('Bot is not running');
    }

    try {
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = undefined;
      }
      this.status = 'Stopped';
      this.socket.emit('botStatus', { botId: this.botId, status: this.status });
    } catch (error) {
      this.status = 'Stopped';
      this.socket.emit('botStatus', { botId: this.botId, status: this.status });
      throw error;
    }
  }

  private async checkAndExecute(): Promise<void> {
    try {
      const currentBalance = await this.getCurrentBalance();
      const gainPercentage = ((currentBalance - this.firstTradePrice) / this.firstTradePrice) * 100;

      if (this.targetGainPercentage && gainPercentage >= this.targetGainPercentage) {
        await this.executeTrade();
        await this.stop();
      } else if (this.stopLossPercentage && gainPercentage <= -Number(this.stopLossPercentage)) {
        logger.warn(`Stop loss triggered at ${gainPercentage}% loss`);
        await this.stop();
      }
    } catch (error) {
      logger.error(`Error in checkAndExecute: ${error}`);
      this.socket.emit('error', { 
        botId: this.botId, 
        message: `Trade check error: ${error instanceof Error ? error.message : String(error)}` 
      });
      throw error;
    }
  }

  private async getCurrentBalance(): Promise<number> {
    // Implementation of getCurrentBalance
    return 0;
  }

  private async executeTrade(): Promise<void> {
    // Implementation of executeTrade
  }
}

export interface NewConfig {
  botId: string;
  // ...
  stopLossPercentage?: bigint; // undefined if not set
}