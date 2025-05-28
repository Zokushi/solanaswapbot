import { MultiConfigRepository } from './configRepository.js';
import logger from '../utils/logger.js';
import { MultiConfig, TargetAmount } from '@prisma/client';
import { BigIntUtils } from '../core/types.js';

/**
 * MultiBotService handles configuration management for multi-token trading bots.
 * 
 * Responsibilities:
 * - Manages multi-token bot configurations (add, update, delete, retrieve)
 * - Handles data validation and transformation for multi-token bots
 * - Manages target amounts for different tokens
 * - Provides error handling and logging for multi-token bot operations
 * - Maintains the connection between ConfigService and MultiConfigRepository
 */
export class MultiBotService {
  private repository: MultiConfigRepository;

  constructor() {
    this.repository = new MultiConfigRepository();
  }

  async addConfig(data: {
    botId: string;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: bigint | number;
    checkInterval?: number;
    targetAmounts: Record<string, number>;
  }): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    try {
      const { targetAmounts, ...configData } = data;
      const targetAmountEntries = Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
        tokenAddress,
        amount,
        configId: data.botId,
      }));
      return await this.repository.create({
        ...configData,
        stopLossPercentage: this.convertStopLossPercentage(configData.stopLossPercentage),
        targetAmounts: targetAmountEntries,
      });
    } catch (error) {
      logger.error(`Error adding multi config: ${error}`);
      throw new Error('Failed to add multi-bot configuration');
    }
  }

  async updateConfig(
    botId: string,
    data: Partial<MultiConfig & { targetAmounts: Record<string, number> }>
  ): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    try {
      const { targetAmounts, ...configData } = data;
      const targetAmountEntries = targetAmounts ? 
        Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
          tokenAddress,
          amount,
          configId: botId,
        })) : undefined;

      return await this.repository.update(botId, {
        ...configData,
        stopLossPercentage: configData.stopLossPercentage ? 
          this.convertStopLossPercentage(configData.stopLossPercentage) : 
          undefined,
        targetAmounts: targetAmountEntries,
      });
    } catch (error) {
      logger.error(`Error updating multi config: ${error}`);
      throw new Error('Failed to update multi-bot configuration');
    }
  }

  async deleteConfig(botId: string): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    try {
      return await this.repository.delete(botId);
    } catch (error) {
      logger.error(`Error deleting multi config: ${error}`);
      throw new Error('Failed to delete multi-bot configuration');
    }
  }

  async getConfig(botId: string): Promise<(MultiConfig & { targetAmounts: TargetAmount[] }) | null> {
    try {
      return await this.repository.findById(botId);
    } catch (error) {
      logger.error(`Error getting multi config: ${error}`);
      throw new Error('Failed to get multi-bot configuration');
    }
  }

  async getAllConfigs(): Promise<(MultiConfig & { targetAmounts: TargetAmount[] })[]> {
    try {
      return await this.repository.findAll();
    } catch (error) {
      logger.error(`Error getting all multi configs: ${error}`);
      throw new Error('Failed to get multi-bot configurations');
    }
  }

  private convertStopLossPercentage(value: bigint | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'bigint' ? Number(value) : value;
  }
} 