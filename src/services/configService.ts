import { Config, MultiConfig, TargetAmount } from '@prisma/client';
import { RegularConfigRepository } from './configRepository.js';
import { MultiConfigRepository } from './configRepository.js';
import { BigIntUtils, BotStatus } from '../core/types.js';
import logger from '../utils/logger.js';

export class RegularConfigService {
  private repository: RegularConfigRepository;

  constructor() {
    this.repository = new RegularConfigRepository();
  }

  async addConfig(data: {
    botId: string;
    initialInputToken: string;
    initialOutputToken: string;
    initialInputAmount: number;
    firstTradePrice: number;
    targetGainPercentage: number;
    stopLossPercentage?: number;
  }): Promise<Config> {
    const configData = {
      ...data,
      stopLossPercentage: data.stopLossPercentage ? 
        Number(BigIntUtils.fromPercentage(data.stopLossPercentage)) : 
        null
    };
    return this.repository.create(configData);
  }

  async updateConfig(botId: string, data: Partial<Config>): Promise<Config> {
    if (data.stopLossPercentage) {
      data.stopLossPercentage = Number(BigIntUtils.fromPercentage(data.stopLossPercentage));
    }
    return this.repository.update(botId, data);
  }

  async deleteConfig(botId: string): Promise<Config> {
    return this.repository.delete(botId);
  }

  async getConfig(botId: string): Promise<Config | null> {
    return this.repository.findById(botId);
  }

  async getAllConfigs(): Promise<Config[]> {
    return this.repository.findAll();
  }
}

export class MultiConfigService {
  private repository: MultiConfigRepository;

  constructor() {
    this.repository = new MultiConfigRepository();
  }

  async addConfig(data: {
    botId: string;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: number;
    checkInterval?: number;
    targetAmounts: Array<{
      tokenAddress: string;
      amount: number;
    }>;
  }): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    const configData = {
      ...data,
      stopLossPercentage: data.stopLossPercentage ? 
        Number(BigIntUtils.fromPercentage(data.stopLossPercentage)) : 
        null,
      targetAmounts: data.targetAmounts.map(ta => ({
        tokenAddress: ta.tokenAddress,
        amount: ta.amount
      }))
    };
    return this.repository.create(configData);
  }

  async updateConfig(
    botId: string, 
    data: Partial<MultiConfig & { targetAmounts: Array<{ tokenAddress: string; amount: number }> }>
  ): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    if (data.stopLossPercentage) {
      data.stopLossPercentage = Number(BigIntUtils.fromPercentage(data.stopLossPercentage));
    }
    return this.repository.update(botId, data);
  }

  async deleteConfig(botId: string): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    return this.repository.delete(botId);
  }

  async getConfig(botId: string): Promise<(MultiConfig & { targetAmounts: TargetAmount[] }) | null> {
    return this.repository.findById(botId);
  }

  async getAllConfigs(): Promise<(MultiConfig & { targetAmounts: TargetAmount[] })[]> {
    return this.repository.findAll();
  }
}

/**
 * ConfigService acts as the main facade for bot configuration management.
 * It provides a unified interface for both regular and multi-token bot configurations.
 * 
 * Responsibilities:
 * - Provides a single entry point for all configuration operations
 * - Delegates to specialized services for bot-specific operations
 * - Maintains backward compatibility
 */
export class ConfigService {
  private regularService: RegularConfigService;
  private multiService: MultiConfigService;

  constructor() {
    this.regularService = new RegularConfigService();
    this.multiService = new MultiConfigService();
  }

  async addConfig(data: any): Promise<Config> {
    return this.regularService.addConfig(data);
  }

  async addMultiConfig(data: any): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    return this.multiService.addConfig(data);
  }

  async updateBotConfig(botId: string, data: any): Promise<Config> {
    return this.regularService.updateConfig(botId, data);
  }

  async updateMultiBotConfig(botId: string, data: any): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    return this.multiService.updateConfig(botId, data);
  }

  async deleteConfig(botId: string): Promise<Config> {
    return this.regularService.deleteConfig(botId);
  }

  async deleteMultiConfig(botId: string): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    return this.multiService.deleteConfig(botId);
  }

  async updateBotStatus(botId: string, status: BotStatus): Promise<void> {
    try {
      // Try to update regular bot first
      try {
        await this.regularService.updateConfig(botId, { status });
        return;
      } catch (error) {
        // If regular bot update fails, try multi bot
        await this.multiService.updateConfig(botId, { status });
      }
    } catch (error) {
      logger.error(`Error updating bot status: ${error}`);
      throw new Error('Failed to update bot status');
    }
  }

  async getAllConfigs(): Promise<{
    regularBots: Config[];
    multiBots: (MultiConfig & { targetAmounts: TargetAmount[] })[];
  }> {
    const [regularBots, multiBots] = await Promise.all([
      this.regularService.getAllConfigs(),
      this.multiService.getAllConfigs()
    ]);

    return { regularBots, multiBots };
  }
}
