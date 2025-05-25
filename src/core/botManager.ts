import { Socket } from "socket.io-client";
import { TradeBot } from "./bot.js";
import { MultiBot } from "./multibot.js";
import { TradeBotConfig, MultiBotConfig } from "./types.js";
import { BotManager, BotInitializer } from "./interfaces.js";
import { createRpcClients } from "../services/rpcFactory.js";
import { getTokenDecimalsByName, getTokenAddressByName, getTokenName } from "../utils/helper.js";
import { ENV } from "../config/index.js";
import logger from "../utils/logger.js";
import bs58 from "bs58";
import { createKeyPairFromBytes, Address } from "@solana/kit";
import { addConfig, addMultiConfig } from "../services/configService.js";
import { getAllConfigs } from "../services/configService.js";
import { Config, MultiConfig, TargetAmount } from "@prisma/client";
import { ConfigService } from "../services/configService.js";

export class DefaultBotManager implements BotManager {
  public activeBots: Map<bigint, TradeBot> = new Map();
  public activeMultiBots: Map<bigint, MultiBot> = new Map();
  private nextBotId: bigint = 1n;
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }

  private generateBotId(): number {
    const usedIds = new Set([
      ...Array.from(this.activeBots.keys()),
      ...Array.from(this.activeMultiBots.keys())
    ]);
    
    while (usedIds.has(this.nextBotId)) {
      this.nextBotId++;
    }
    
    // Convert bigint to number before returning, to fix type error
    const botId = Number(this.nextBotId);
    this.nextBotId++;
    return botId;
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

    // Convert botId to bigint if it's a string
    const botId = typeof config.botId === 'string' ? BigInt(config.botId) : config.botId;

    if (
      typeof config.initialInputToken !== 'string' ||
      typeof config.initialOutputToken !== 'string' ||
      typeof config.initialInputAmount !== 'number' ||
      typeof config.firstTradePrice !== 'number' ||
      !botId
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
      botId,
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
    this.activeBots.set(botId, bot);
    return bot;
  }

  private async initializeMultiBot(config: Partial<MultiBotConfig>, socket: Socket): Promise<MultiBot> {
    const solanaEndpoint: string = ENV.solanaEndpoint!;
    const wallet: string = ENV.wallet!;
    const wssEndpoint: string = ENV.wss!;
    if (!solanaEndpoint || !wallet || !wssEndpoint) {
      logger.error('Required environment variables are not set');
    }

    const { rpc, subscriptions } = await createRpcClients({ solanaEndpoint, wssEndpoint });
    const decodedKey = new Uint8Array(bs58.decode(wallet));
    const keypair = await createKeyPairFromBytes(decodedKey);

    // Convert botId to bigint if it's a string
    const botId = typeof config.botId === 'string' ? BigInt(config.botId) : config.botId;

    if (
      typeof config.initialInputToken !== 'string' ||
      typeof config.initialInputAmount !== 'number' ||
      !botId ||
      typeof config.targetGainPercentage !== 'number'
    ) {
      throw new Error('Missing or invalid required config fields');
    }

    const inputToken = await getTokenDecimalsByName(config.initialInputToken);
    const tokenIn = await getTokenAddressByName(config.initialInputToken);
    // Store the raw amount without decimal multiplication
    const initialInputAmount = Number(config.initialInputAmount);

    const targetAmounts: Record<string, number> = {};
    if (config.targetAmounts) {
      for (const [tokenName, amount] of Object.entries(config.targetAmounts)) {
        try {
          const token = await getTokenDecimalsByName(tokenName);
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
      botId,
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
    this.activeMultiBots.set(botId, bot);
    return bot;
  }

  public async startBot(config: Partial<TradeBotConfig>, socket: Socket): Promise<void> {
    try {
      if (!config.botId) {
        throw new Error('botId is required');
      }
      // Convert string to bigint if needed
      const botId = typeof config.botId === 'string' ? BigInt(config.botId) : config.botId;
      const bot = await this.initializeBot({ ...config, botId }, socket);
      await this.configService.updateBotStatus(botId, 'active');
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
      // Convert string to bigint if needed
      const botId = typeof config.botId === 'string' ? BigInt(config.botId) : config.botId;
      const bot = await this.initializeMultiBot({ ...config, botId }, socket);
      await this.configService.updateBotStatus(botId, 'active');
    } catch (error) {
      console.error('Failed to start multi bot:', error);
      throw error;
    }
  }

  public async stopBot(botId: bigint): Promise<void> {
    const bot = this.activeBots.get(botId);
    if (bot) {
      bot.terminateSession();
      this.activeBots.delete(botId);
      await this.configService.updateBotStatus(botId, 'inactive');
    }

    const multiBot = this.activeMultiBots.get(botId);
    if (multiBot) {
      multiBot.terminateSession();
      this.activeMultiBots.delete(botId);
      await this.configService.updateBotStatus(botId, 'inactive');
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

  public async getBotStatus(botId: bigint): Promise<any> {
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

    return null;
  }

  public async getAllBots(): Promise<{
    regularBots: Array<Config & { status: string }>;
    multiBots: Array<MultiConfig & { status: string; targetAmounts: TargetAmount[] }>;
  }> {
    const { regularBots, multiBots } = await this.configService.getAllConfigs();
    return this.serializeForSocket({
      regularBots: regularBots.map(bot => ({
        ...bot,
        status: this.activeBots.has(bot.botId) ? 'active' : 'inactive'
      })),
      multiBots: multiBots.map(bot => ({
        ...bot,
        status: this.activeMultiBots.has(bot.botId) ? 'active' : 'inactive'
      }))
    });
  }

  public async getConfigs() {
    const { regularBots, multiBots } = await getAllConfigs();
    return this.serializeForSocket({
      regularBots: regularBots.map((bot: Config) => ({
        ...bot,
        status: this.activeBots.has(bot.botId) ? 'active' : 'inactive'
      })),
      multiBots: multiBots.map((bot: MultiConfig & { targetAmounts: TargetAmount[] }) => ({
        ...bot,
        status: this.activeMultiBots.has(bot.botId) ? 'active' : 'inactive'
      }))
    });
  }
} 

