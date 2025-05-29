import { RegularConfigRepository, MultiConfigRepository } from './configRepository.js';
import logger from '../utils/logger.js';
import { Config, MultiConfig, TargetAmount } from '@prisma/client';

type BotConfig = Config | (MultiConfig & { targetAmounts: TargetAmount[] });
type BotData = Partial<Config> | Partial<MultiConfig & { targetAmounts: Record<string, number> }>;

interface Repository<T> {
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
}

export class BotService<T extends BotConfig> {
  constructor(private repository: Repository<T>) {}

  async addConfig(data: BotData): Promise<T> {
    try {
      const processedData = this.processData(data);
      return await this.repository.create(processedData);
    } catch (error) {
      logger.error(`Error adding config: ${error}`);
      throw new Error('Failed to add configuration');
    }
  }

  async updateConfig(botId: string, data: Partial<BotData>): Promise<T> {
    try {
      const processedData = this.processData(data);
      return await this.repository.update(botId, processedData);
    } catch (error) {
      logger.error(`Error updating config: ${error}`);
      throw new Error('Failed to update configuration');
    }
  }

  async deleteConfig(botId: string): Promise<T> {
    try {
      return await this.repository.delete(botId);
    } catch (error) {
      logger.error(`Error deleting config: ${error}`);
      throw new Error('Failed to delete configuration');
    }
  }

  async getConfig(botId: string): Promise<T | null> {
    try {
      return await this.repository.findById(botId);
    } catch (error) {
      logger.error(`Error getting config: ${error}`);
      throw new Error('Failed to get configuration');
    }
  }

  async getAllConfigs(): Promise<T[]> {
    try {
      return await this.repository.findAll();
    } catch (error) {
      logger.error(`Error getting all configs: ${error}`);
      throw new Error('Failed to get configurations');
    }
  }

  private processData(data: BotData): Partial<T> {
    const processed: any = { ...data };
    if ('stopLossPercentage' in processed) {
      processed.stopLossPercentage = this.convertStopLossPercentage(processed.stopLossPercentage);
    }
    if (
      typeof data === 'object' &&
      data !== null &&
      'targetAmounts' in data &&
      data.targetAmounts &&
      typeof data.targetAmounts === 'object'
    ) {
      processed.targetAmounts = Object.entries(data.targetAmounts).map(([tokenAddress, amount]) => ({
        tokenAddress,
        amount,
        configId: (data as any).botId as string,
      }));
    }
    return processed as Partial<T>;
  }

  private convertStopLossPercentage(value: bigint | number | null | undefined): number | null {
    return value == null ? null : typeof value === 'bigint' ? Number(value) : value;
  }
}

// Instantiate services
export const regularBotService = new BotService(new RegularConfigRepository());
export const multiBotService = new BotService(new MultiConfigRepository());