import { Socket } from "socket.io-client";
import { TradeBot } from "./bot.js";
import { MultiBot } from "./multibot.js";
import { TradeBotConfig, MultiBotConfig } from "./types.js";
import { Config, MultiConfig, TargetAmount } from "@prisma/client";

export interface BotInitializer {
  initializeBot(config: Partial<TradeBotConfig>, socket: Socket): Promise<TradeBot>;
  initializeMultiBot(config: Partial<MultiBotConfig>, socket: Socket): Promise<MultiBot>;
}

export interface BotManager {
  activeBots: Map<bigint, TradeBot>;
  activeMultiBots: Map<bigint, MultiBot>;
  startBot(config: Partial<TradeBotConfig>, socket: Socket): Promise<void>;
  startMultiBot(config: Partial<MultiBotConfig>, socket: Socket): Promise<void>;
  stopBot(botId: bigint): Promise<void>;
  getBotStatus(botId: bigint): Promise<any>;
  getAllBots(): Promise<{
    regularBots: Array<Config & { status: string }>;
    multiBots: Array<MultiConfig & { status: string; targetAmounts: TargetAmount[] }>;
  }>;
} 