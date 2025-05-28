import { QuoteResponse, BotData, MultiBotConfig, BotStatus } from "./types.js";
import logger from "../utils/logger.js";
import { address, Address, createSolanaRpcSubscriptions, getAddressFromPublicKey, Rpc, SolanaRpcApiMainnet } from "@solana/kit";
import { getTokenDecimalsByAddress, getTokenDecimalsByAddressRaw, getTokenName } from "../utils/helper.js";
import { TradeService } from "../services/tradeService.js";
import { NotificationService } from "../services/notificationService.js";
import { ConfigService } from "../services/configService.js";
import { Socket } from "socket.io-client";

/**
 * Manages automated trading operations for a specific bot instance on the Solana blockchain.
 * This class starts with a single token balance, monitors trade ratios for multiple token pairs,
 * executes trades when targets are met, and updates target ratios based on a gain percentage.
 */
export class MultiBot {
  // Public properties
  public readonly botId: string;
  public status: BotStatus = 'stopped';
  public difference: number;
  public ratio: number;
  public currentTrade: number;
  public currentMint: Address;
  public currentTokenAccount!: Address;
  public initialBalance: number;
  public targetAmounts: Record<string, number>;
  public targetGainPercentage: number;
  public checkInterval: number;
  public tradeCounter: number;
  public waitingForConfirmation: boolean = false;

  // Private properties
  private readonly wallet: CryptoKeyPair;
  private readonly rpc: Rpc<SolanaRpcApiMainnet>;
  private readonly subscriptions: ReturnType<typeof createSolanaRpcSubscriptions>;
  private readonly socket: Socket;
  private readonly tradeService: TradeService;
  private readonly notificationService: NotificationService;
  private readonly configService: ConfigService;
  private priceWatchIntervalId?: NodeJS.Timeout;
  private lastCheck: number;
  private stopped: boolean;

  constructor(
    config: MultiBotConfig & { targetAmounts: Record<string, number>; initialBalance: number; targetGainPercentage: number },
    socket: Socket,
  ) {
    if (!config.rpc) {
      throw new Error('RPC client is required');
    }
    if (!config.subscriptions) {
      throw new Error('Subscriptions client is required');
    }

    logger.info(`[Bot ${config.botId}] Constructing new MultiBot instance`);
    this.botId = config.botId;
    this.wallet = config.wallet;
    this.rpc = config.rpc;
    this.subscriptions = config.subscriptions;
    this.socket = socket;
    this.difference = 0;
    this.currentTrade = 0;
    this.ratio = 0;
    this.status = "running";
    this.initialBalance = config.initialBalance;
    this.targetAmounts = config.targetAmounts;
    this.targetGainPercentage = config.targetGainPercentage;
    this.tradeCounter = 0;
    this.stopped = false;
    this.checkInterval = config.checkInterval || 20000;
    this.lastCheck = 0;
    this.currentMint = config.initialInputToken as Address;

    this.tradeService = new TradeService(
      this.botId,
      this.wallet,
      this.rpc,
      this.subscriptions,
      this.postTransactionProcessing.bind(this),
      this.setWaitingForConfirmation.bind(this)
    );
    this.notificationService = new NotificationService();
    this.configService = new ConfigService();

    logger.info(`[Bot ${this.botId}] Starting initialization`);
    this.init().catch((error) => {
      const errorMsg = `[Bot ${this.botId}] Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
    });
  }

  async init(): Promise<void> {
    const tokenName = await getTokenName(this.currentMint); // Use mint for token name
    const logMsg = `[Bot ${this.botId}] Initiating trade bot with ${this.initialBalance} ${tokenName}`;
    logger.info(logMsg);

    logger.info(`[Bot ${this.botId}] Fetching public key from wallet`);
    const pubWallet = await getAddressFromPublicKey(this.wallet.publicKey);
    if (!pubWallet) {
      const errorMsg = `[Bot ${this.botId}] Error fetching public key`;
      logger.error(errorMsg);
      throw new Error("Error fetching public key. Make sure keypair provided is set and valid.");
    }
    logger.info(`[Bot ${this.botId}] Public key fetched: ${pubWallet}`);

    logger.info(`[Bot ${this.botId}] Fetching token account for ${tokenName} (${this.currentMint})`);
    this.currentTokenAccount = await this.tradeService.getFilteredTokenAccounts(pubWallet as Address, this.currentMint) as Address;
    logger.info(`[Bot ${this.botId}] Token account updated: ${this.currentTokenAccount}`);

    const MAX_RETRIES = 3;
    let retries = 0;

    logger.info(`[Bot ${this.botId}] Starting balance refresh for ${tokenName}`);
    while (retries < MAX_RETRIES) {
      try {
        logger.info(`[Bot ${this.botId}] Refreshing balance, attempt ${retries + 1}/${MAX_RETRIES}`);
        logger.info(`[Bot ${this.botId}] Balance: ${this.initialBalance}`);
        if (this.initialBalance <= 0) {
          const errorMsg = `[Bot ${this.botId}] Insufficient initial balance: ${this.initialBalance}`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        break;
      } catch (error) {
        retries++;
        const errorMsg = `[Bot ${this.botId}] Error refreshing balance, attempt ${retries}/${MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        if (retries >= MAX_RETRIES) {
          const retryErrorMsg = `[Bot ${this.botId}] Failed to refresh balance after ${MAX_RETRIES} retries`;
          logger.error(retryErrorMsg);
          throw new Error(retryErrorMsg);
        }
        logger.info(`[Bot ${this.botId}] Retrying after delay of ${1000 * retries}ms`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
      }
    }

    logger.info(`[Bot ${this.botId}] Initiating price watch`);
    this.initiatePriceWatch();
  }

  private initiatePriceWatch(): void {
    logger.info(`[Bot ${this.botId}] Starting price watch with interval ${this.checkInterval}ms`);
    this.priceWatchIntervalId = setInterval(async () => {
      if (this.stopped || !this.priceWatchIntervalId) {
        logger.info(`[Bot ${this.botId}] Price watch stopped`);
        clearInterval(this.priceWatchIntervalId);
        this.priceWatchIntervalId = undefined;
        return;
      }

      const currentTime = Date.now();
      if (currentTime - this.lastCheck < this.checkInterval) return;

      this.lastCheck = currentTime;

      if (this.waitingForConfirmation) {
        logger.info(`[Bot ${this.botId}] Waiting for transaction confirmation...`);
        return;
      }

      try {
        const timeout = setTimeout(() => {
          throw new Error("Quote fetch timed out");
        }, 40000);
        logger.info(`[Bot ${this.botId}] Checking trade opportunities...`);
        await this.checkTradeOpportunities();
        clearTimeout(timeout);
      } catch (error) {
        const errorMsg = `[Bot ${this.botId}] Error in price watch: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
      }
    }, this.checkInterval);
  }

  public setWaitingForConfirmation(flag: boolean): void {
    logger.info(`[Bot ${this.botId}] Setting waitingForConfirmation to ${flag}`);
    this.waitingForConfirmation = flag;
  }

  private async checkTradeOpportunities(): Promise<void> {
    const currentTokenName = await getTokenName(this.currentMint); // Use mint for token name

    const inputDecimals = await getTokenDecimalsByAddressRaw(this.currentMint);
    const amountInLamports = this.initialBalance * Math.pow(10, inputDecimals);

    for (const [targetMint, targetAmount] of Object.entries(this.targetAmounts)) {
      const targetTokenName = await getTokenName(targetMint as Address);
      logger.info(`[Bot ${this.botId}] Fetching quote for ${currentTokenName} -> ${targetTokenName} (${targetMint})`);

      const quote = await this.tradeService.getQuote2({
        inputMint: this.currentMint, // Use mint, not token account
        outputMint: targetMint as Address,
        amount: amountInLamports,
        swapMode: "ExactIn",
      });

      if (!quote || !quote.outAmount) {
        const logMsg = `[Bot ${this.botId}] No quote available for ${targetMint}`;
        logger.error(logMsg);
        continue;
      }

      const outputDecimals = await getTokenDecimalsByAddressRaw(targetMint as Address);
      const currentOutputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);
      const targetOutputAmount = targetAmount; // Already in human-readable form
      logger.info(`[Bot ${this.botId}] Comparing amounts for ${targetMint}: Current=${currentOutputAmount}, Target=${targetOutputAmount}`);

      const ratioMet = currentOutputAmount >= targetOutputAmount;
      if (ratioMet) {
        logger.info(`[Bot ${this.botId}] Ratio met for ${targetTokenName}: ${currentOutputAmount} >= ${targetOutputAmount}. Executing trade...`);
        await this.tradeService.evaluateQuoteAndSwap(quote, this.initialBalance);
        return;
      } else {
        const difference = ((currentOutputAmount - targetOutputAmount) / targetOutputAmount) * 100;
        this.currentTrade = currentOutputAmount;
        this.difference = difference;
        logger.info(`[Bot ${this.botId}] Ratio not met for ${targetTokenName}: Difference=${difference.toFixed(3)}% (Current=${currentOutputAmount}, Target=${targetOutputAmount})`);

        const botData: BotData = {
          botId: this.botId,
          status: this.stopped ? "stopped" : "running",
          inputMint: currentTokenName,
          outputMint: targetTokenName,
          currentPrice: currentOutputAmount,
          targetTrade: targetOutputAmount,
          difference: difference,
          trades: this.tradeCounter
        };

        // Emit the bot data to update the dashboard
        this.notificationService.emit(this.socket, 'bot:difference', botData);
      }
    }
  }

  public postTransactionProcessing = async (quote: QuoteResponse, txid: string): Promise<void> => {
    const { inputMint, inAmount, outputMint, outAmount } = quote;
    const inputTokenName = await getTokenName(inputMint);
    const outputTokenName = await getTokenName(outputMint);
    logger.info(`[Bot ${this.botId}] Processing completed transaction: ${inputTokenName} -> ${outputTokenName}, TxID: ${txid}`);

    const outputDecimals = await getTokenDecimalsByAddressRaw(outputMint as Address);
    const inputDecimals = await getTokenDecimalsByAddressRaw(inputMint as Address);
    const receivedAmount = parseInt(outAmount) / Math.pow(10, outputDecimals);
    logger.info(`[Bot ${this.botId}] Expected to receive ${receivedAmount} ${outputTokenName}`);

    // Update the mint and token account after the trade
    this.currentMint = outputMint as Address;
    const pubWallet = await getAddressFromPublicKey(this.wallet.publicKey);
    if (!pubWallet) {
      const errorMsg = `[Bot ${this.botId}] Error fetching public key after trade`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    logger.info(`[Bot ${this.botId}] Fetching new token account for ${outputTokenName} (${this.currentMint})`);
    this.currentTokenAccount = await this.tradeService.getFilteredTokenAccounts(pubWallet, this.currentMint) as Address;
    if (!this.currentTokenAccount) {
      const errorMsg = `[Bot ${this.botId}] Failed to fetch token account for ${outputTokenName} (${this.currentMint})`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    logger.info(`[Bot ${this.botId}] Updated current token account to ${this.currentTokenAccount}`);

    // Verify the actual balance after the trade
    logger.info(`[Bot ${this.botId}] Verifying balance for new token account ${this.currentTokenAccount}`);
    const actualBalance = receivedAmount;
    if (actualBalance === undefined || actualBalance <= 0) {
      const errorMsg = `[Bot ${this.botId}] Invalid balance after trade: ${actualBalance} ${outputTokenName}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    this.initialBalance = actualBalance;
    logger.info(`[Bot ${this.botId}] Updated current mint to ${outputTokenName} (${this.currentMint}) with verified balance ${this.initialBalance}`);

    // Update target amounts with the gain factor
    const gainFactor = 1 + (this.targetGainPercentage / 100);
    logger.info(`[Bot ${this.botId}] Updating target amounts with gain factor ${gainFactor} (${this.targetGainPercentage}%)`);
    this.targetAmounts = Object.fromEntries(
      Object.entries(this.targetAmounts).map(([mint, amount]) => {
        if (mint === outputMint) {
          const gain = Number(inAmount) * gainFactor;
          const newAmount = gain / Math.pow(10, inputDecimals);
          const newMint = inputMint as Address;
          return [newMint, newAmount];
        }
        return [mint, amount * gainFactor];
      })
    );

    try {
      await this.configService.updateBotConfig(this.botId, {
        botId: this.botId,
        initialInputToken: await getTokenName(this.currentMint)!,
        initialBalance: this.initialBalance,
        targetAmounts: this.targetAmounts,
        targetGainPercentage: this.targetGainPercentage,
        checkInterval: this.checkInterval,
      });
      logger.info(`[Bot ${this.botId}] Successfully updated config file after trade`);
    } catch (error) {
      logger.error(`[Bot ${this.botId}] Failed to update config file: ${error instanceof Error ? error.message : String(error)}`);
    }

    const logAmount = await getTokenDecimalsByAddress(inputMint as Address, parseFloat(inAmount));
    const logOutAmount = await getTokenDecimalsByAddress(outputMint as Address, parseFloat(outAmount));
    logger.info(`[Bot ${this.botId}] Logging swap: ${logAmount} ${inputTokenName} -> ${logOutAmount} ${outputTokenName}`);
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
    const tradeMsg = `[Bot ${this.botId}] Trade completed: Swapped ${inputTokenName} for ${outputTokenName} (TxID: ${txid})`;
    logger.info(tradeMsg);
  };

  public terminateSession(): void {
    logger.info(`[Bot ${this.botId}] Terminating bot...`);
    this.notificationService.log(`[Bot ${this.botId}] ❌ Terminating bot...`, (this.botId));
    this.stopped = true;

    if (this.priceWatchIntervalId) {
      clearInterval(this.priceWatchIntervalId);
      this.priceWatchIntervalId = undefined;
    }

    logger.info(`[Bot ${this.botId}] Bot terminated successfully`);
    this.notificationService.log(`[Bot ${this.botId}] Bot terminated successfully`, (this.botId));
  }
}

export default MultiBot;
