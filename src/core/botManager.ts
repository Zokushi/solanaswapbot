import { Socket } from "socket.io-client";
import { TradeBot } from "./bot.js";
import { MultiBot } from "./multibot.js";
import { TradeBotConfig, MultiBotConfig, BotResponse, BotManager, LogSwapArgs } from "./types.js";
import { createRpcClients } from "../services/rpcFactory.js";
import { getTokenDecimalsByName, getTokenAddressByName } from "../utils/helper.js";
import { ENV } from "../config/index.js";
import logger from "../utils/logger.js";
import bs58 from "bs58";
import { createKeyPairFromBytes, Address } from "@solana/kit";
import { Config, MultiConfig, TargetAmount } from "@prisma/client";
import { ConfigService } from "../services/configService.js";
import { TransactionService } from "../services/transactionService.js";

export class DefaultBotManager implements BotManager {
  public activeBots: Map<string, TradeBot> = new Map();
  public activeMultiBots: Map<string, MultiBot> = new Map();
  private configService: ConfigService;
  private transactionService: TransactionService;

  constructor() {
    this.configService = new ConfigService();
    this.transactionService = new TransactionService();
  }

  private async initializeBot(config: Partial<TradeBotConfig>, socket: Socket): Promise<TradeBot> {
    const solanaEndpoint: string = ENV.solanaEndpoint!;
    const wallet: string = ENV.wallet!;
    const wssEndpoint: string = ENV.wss!;
    if (!solanaEndpoint || !wallet || !wssEndpoint) {
      throw new Error('Required environment variables are not set');
    }

    const { rpc, subscriptions } = await createRpcClients({ solanaEndpoint, wssEndpoint });
    const decodedKey = new Uint8Array(bs58.decode(wallet));
    const keypair = await createKeyPairFromBytes(decodedKey);

    if (
      typeof config.initialInputToken !== 'string' ||
      typeof config.initialOutputToken !== 'string' ||
      typeof config.initialInputAmount !== 'number' ||
      typeof config.firstTradePrice !== 'number' ||
      !config.botId
    ) {
      throw new Error('Missing or invalid required config fields');
    }

    const inputToken = await getTokenDecimalsByName(config.initialInputToken);
    const outputToken = await getTokenDecimalsByName(config.initialOutputToken);
    const tokenIn = await getTokenAddressByName(config.initialInputToken);
    const tokenOut = await getTokenAddressByName(config.initialOutputToken);
    const initialInputAmount = Number(config.initialInputAmount) * 10 ** inputToken.decimals;
    const firstTradePrice = Number(config.firstTradePrice) * 10 ** outputToken.decimals;

    const botConfig: TradeBotConfig = {
      botId: config.botId,
      wallet: keypair,
      firstTradePrice,
      rpc,
      subscriptions,
      targetGainPercentage: config.targetGainPercentage!,
      initialInputToken: tokenIn as Address,
      initialInputAmount,
      initialOutputToken: tokenOut as Address,
      stopLossPercentage: config.stopLossPercentage,
    };

    const bot = new TradeBot(botConfig, socket);
    this.activeBots.set(botConfig.botId, bot);
    return bot;
  }

  private async initializeMultiBot(config: Partial<MultiBotConfig>, socket: Socket): Promise<MultiBot> {
    const solanaEndpoint: string = ENV.solanaEndpoint!;
    const wallet: string = ENV.wallet!;
    const wssEndpoint: string = ENV.wss!;
    if (!solanaEndpoint || !wallet || !wssEndpoint) {
      logger.error('Required environment variables are not set');
      throw new Error('Required environment variables are not set');
    }

    const { rpc, subscriptions } = await createRpcClients({ solanaEndpoint, wssEndpoint });
    const decodedKey = new Uint8Array(bs58.decode(wallet));
    const keypair = await createKeyPairFromBytes(decodedKey);

    if (
      typeof config.initialInputToken !== 'string' ||
      typeof config.initialInputAmount !== 'number' ||
      !config.botId ||
      typeof config.targetGainPercentage !== 'number'
    ) {
      logger.error('Missing or invalid required config fields');
      throw new Error('Missing or invalid required config fields');
    }

    const tokenIn = await getTokenAddressByName(config.initialInputToken);
    // Store the raw amount without decimal multiplication
    const initialInputAmount = Number(config.initialInputAmount);

    const targetAmounts: Record<string, number> = {};
    if (config.targetAmounts) {
      for (const [tokenName, amount] of Object.entries(config.targetAmounts)) {
        try {
          const tokenAddress = await getTokenAddressByName(tokenName);
          // Store target amounts in raw form without decimal multiplication
          targetAmounts[tokenAddress] = Number(amount);
        } catch (error) {
          logger.error(`Failed to process target amount for token ${tokenName}: ${error}`);
          throw new Error(`Invalid token name: ${tokenName}`);
        }
      }
    }

    if (Object.keys(targetAmounts).length === 0) {
      throw new Error('At least one target token and amount must be specified for MultiBot');
    }

    const botConfig: MultiBotConfig & {
      targetAmounts: Record<string, number>;
      initialBalance: number;
      targetGainPercentage: number;
    } = {
      botId: config.botId,
      wallet: keypair,
      rpc,
      subscriptions,
      initialInputToken: tokenIn as Address,
      initialInputAmount,
      initialBalance: config.initialBalance ?? initialInputAmount,
      targetAmounts,
      targetGainPercentage: config.targetGainPercentage,
      stopLossPercentage: config.stopLossPercentage,
      checkInterval: config.checkInterval,
    };

    const bot = new MultiBot(botConfig, socket);
    this.activeMultiBots.set(botConfig.botId, bot);
    return bot;
  }

  public async startBot(config: Partial<TradeBotConfig>, socket: Socket): Promise<void> {
    try {
      if (!config.botId) {
        throw new Error('botId is required');
      }
      await this.initializeBot({ ...config, botId: config.botId }, socket);
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  public async startMultiBot(config: Partial<MultiBotConfig>, socket: Socket): Promise<void> {
    try {
      if (!config.botId) {
        throw new Error('botId is required');
      }
      await this.initializeMultiBot({ ...config, botId: config.botId }, socket);
    } catch (error) {
      console.error('Failed to start multi bot:', error);
      throw error;
    }
  }

  public async stopBot(botId: string): Promise<void> {
    const bot = this.activeBots.get(botId);
    if (bot) {
      bot.terminateSession();
      this.activeBots.delete(botId);
    }

    const multiBot = this.activeMultiBots.get(botId);
    if (multiBot) {
      multiBot.terminateSession();
      this.activeMultiBots.delete(botId);
    }
  }

  public async getAllBots(): Promise<{
    regularBots: (Partial<Config> & { botId: string; status: string })[];
    multiBots: (MultiConfig & { botId: string; status: string; targetAmounts: TargetAmount[] })[];
  }> {
    const { regularBots, multiBots } = await this.configService.getAllConfigs();
    
    // Get all bot IDs from the active maps
    const activeRegularBotIds = new Set(this.activeBots.keys());
    const activeMultiBotIds = new Set(this.activeMultiBots.keys());

    return this.serializeForSocket({
      regularBots: regularBots.map(bot => ({
        ...bot,
        status: activeRegularBotIds.has(bot.botId) ? 'running' : 'stopped'
      })),
      multiBots: multiBots.map(bot => ({
        ...bot,
        status: activeMultiBotIds.has(bot.botId) ? 'running' : 'stopped'
      }))
    });
  }

  public async getTransactionList(): Promise<Array<LogSwapArgs>> {
    try {
      const transactions = await this.transactionService.handleGetTransactions();
      return transactions.map((tx: LogSwapArgs) => ({
        ...tx,
        tokenIn: tx.tokenIn,
        tokenOut: tx.tokenOut,
        amountIn: Number(tx.tokenInAmount),
        amountOut: Number(tx.tokenOutAmount),
        tokenInUSD: Number(tx.tokenInUSD),
        tokenOutUSD: Number(tx.tokenOutUSD),
        totalValueUSD: Number(tx.totalValueUSD),
        timestamp: new Date(tx.date).toISOString(),
      }));
    } catch (error) {
      logger.error(`Error fetching transaction list: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to fetch transaction list');
    }
  }
  
  public async deleteConfig(botId: string, type: 'regular' | 'multi'): Promise<void> {
    try {
      if (type === 'regular') {
        await this.configService.deleteConfig(botId);
      } else {
        await this.configService.deleteMultiConfig(botId);
      }
    } catch (error) {
      logger.error(`Error deleting configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to delete configuration');
    }
  }

  public async updateBotConfig(botId: string, config: Partial<TradeBotConfig>): Promise<void> {
    try {
      // First stop the bot if it's running
      await this.stopBot(botId);
      // Update the configuration
      await this.configService.updateBotConfig(botId, config);
    } catch (error) {
      logger.error(`Error updating bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to update configuration');
    }
  }

  public async updateMultiBotConfig(botId: string, config: Partial<MultiBotConfig>): Promise<void> {
    try {
      // First stop the bot if it's running
      await this.stopBot(botId);
      // Update the configuration
      await this.configService.updateMultiBotConfig(botId, config);
    } catch (error) {
      logger.error(`Error updating multi-bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to update multi-bot configuration');
    }
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

  public async getBotStatus(botId: string): Promise<BotResponse> {
    const bot = this.activeBots.get(botId);
    if (bot) {
      return this.serializeForSocket({
        botId,
        status: bot.status,
        difference: bot.difference,
        currentTrade: bot.currentTrade,
        ratio: bot.ratio,
        tradeCounter: bot.tradeCounter
      });
    }

    const multiBot = this.activeMultiBots.get(botId);
    if (multiBot) {
      return this.serializeForSocket({
        botId,
        status: multiBot.status,
        difference: multiBot.difference,
        currentTrade: multiBot.currentTrade,
        tradeCounter: multiBot.tradeCounter
      });
    }

    return this.serializeForSocket({
      botId,
      status: 'stopped'
    });
  }
} 

