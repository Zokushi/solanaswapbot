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
  public status: BotStatus = 'stopped';
  public difference: number;
  public ratio: number;
  public currentTrade: number;
  public inputTokenAccount: Address;
  public outputTokenAccount: Address;
  public firstTradePrice: number;
  public targetGainPercentage: number | undefined;
  public stopLossPercentage: number | undefined;
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
    this.stopLossPercentage = config.stopLossPercentage;
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
        }, 15000);
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

    if (this.stopLossPercentage && diff < -this.stopLossPercentage) {
      this.notificationService.log(`Bot ID: ${this.botId} - Stop loss triggered at ${currentPriceWithDecimals}. Terminating.`, this.botId);
      this.terminateSession();
      return;
    }

    const inputName = await getTokenName(this.nextTrade.inputMint);
    const outputName = await getTokenName(this.nextTrade.outputMint);
    const botData: BotData = {
      botId: this.botId,
      status: this.stopped ? "stopped" : "running",
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
    this.notificationService.emit(this.socket, 'bot:difference', botData);
  }

  /**
   * Updates the next trade configuration based on the last trade result.
   * @param {QuoteResponse} lastTrade - The result of the last executed trade.
   * @returns {Promise<void>}
   * @throws {Error} If target gain percentage is invalid or calculation overflows.
   * @private
   */
  private async updateNextTrade(lastTrade: QuoteResponse): Promise<void> {
    // Convert string amounts to BigInt for precise calculations
    const inLamports = BigInt(lastTrade.inAmount);
    const outLamports = BigInt(lastTrade.outAmount);
    
    if (!this.targetGainPercentage || this.targetGainPercentage <= 0) {
      throw new Error(`Bot ID: ${this.botId} - Invalid target gain percentage: ${this.targetGainPercentage}`);
    }

    // Convert target gain percentage to a decimal (e.g., 1% -> 0.01)
    const targetGainDecimal = this.targetGainPercentage / 100;
    
    // Calculate target gain in lamports with more precision
    // Multiply by 10000 to maintain 4 decimal places of precision
    const targetGainLamports = (inLamports * BigInt(Math.floor(targetGainDecimal * 10000))) / BigInt(10000);
    
    // Calculate current gain in lamports
    const currentGainLamports = outLamports - inLamports;

    logger.info(`Bot ID: ${this.botId} - Trade Analysis:
      Input Amount: ${inLamports.toString()}
      Output Amount: ${outLamports.toString()}
      Current Gain: ${currentGainLamports.toString()}
      Target Gain: ${targetGainLamports.toString()}
      Target Percentage: ${this.targetGainPercentage}%`);

    // Update next trade with the output amount from last trade
    // Reverse the trade direction and use the output amount as the new input amount
    this.nextTrade = {
      inputMint: lastTrade.outputMint,  // Use the output token as the new input
      outputMint: lastTrade.inputMint,  // Use the input token as the new output
      amount: Number(outLamports),      // Use the output amount as the new input amount
      swapMode: "ExactIn",
    };

    // Calculate new target price for next trade
    // Target price should be the input amount plus the target gain
    const newTargetPrice = inLamports + targetGainLamports;
    this.firstTradePrice = Number(newTargetPrice);

    logger.info(`Bot ID: ${this.botId} - Next Trade Setup:
      Input Mint: ${this.nextTrade.inputMint}
      Output Mint: ${this.nextTrade.outputMint}
      Amount: ${this.nextTrade.amount}
      New Target Price: ${this.firstTradePrice}`);
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
}