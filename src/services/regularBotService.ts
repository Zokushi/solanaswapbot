import { RegularConfigRepository } from './configRepository.js';
import { createLogger } from '../utils/logger.js';
import { Config } from '@prisma/client';

const logger = createLogger('RegularBotService');
/**
 * RegularBotService handles configuration management for regular trading bots.
 * 
 * Responsibilities:
 * - Manages regular bot configurations (add, update, delete, retrieve)
 * - Handles data validation and transformation for regular bots
 * - Provides error handling and logging for regular bot operations
 * - Maintains the connection between ConfigService and RegularConfigRepository
 */
export class RegularBotService {
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
    stopLossPercentage?: bigint | number;
  }): Promise<Config> {
    try {
      const stopLoss = this.convertStopLossPercentage(data.stopLossPercentage);
      return await this.repository.create({ ...data, stopLossPercentage: stopLoss });
    } catch (error) {
      logger.error(`Error adding config: ${error}`);
      throw new Error('Failed to add configuration');
    }
  }

  async updateConfig(botId: string, data: Partial<Config>): Promise<Config> {
    try {
      if (data.stopLossPercentage) {
        data.stopLossPercentage = this.convertStopLossPercentage(data.stopLossPercentage);
      }
      return await this.repository.update(botId, data);
    } catch (error) {
      logger.error(`Error updating config: ${error}`);
      throw new Error('Failed to update configuration');
    }
  }

  async deleteConfig(botId: string): Promise<Config> {
    try {
      return await this.repository.delete(botId);
    } catch (error) {
      logger.error(`Error deleting config: ${error}`);
      throw new Error('Failed to delete configuration');
    }
  }

  async getConfig(botId: string): Promise<Config | null> {
    try {
      return await this.repository.findById(botId);
    } catch (error) {
      logger.error(`Error getting config: ${error}`);
      throw new Error('Failed to get configuration');
    }
  }

  async getAllConfigs(): Promise<Config[]> {
    try {
      return await this.repository.findAll();
    } catch (error) {
      logger.error(`Error getting all configs: ${error}`);
      throw new Error('Failed to get configurations');
    }
  }

  private convertStopLossPercentage(value: bigint | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'bigint' ? Number(value) : value;
  }
} 