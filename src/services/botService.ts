import { RegularConfigRepository, MultiConfigRepository } from './configRepository.js';
import { createLogger } from '../utils/logger.js';
import { Config, MultiConfig, TargetAmount } from '@prisma/client';
import { TradeBotError, ErrorCodes } from '../utils/errors.js';
import { handleError } from '../utils/errorHandler.js';

const logger = createLogger('BotService');

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
  constructor(protected repository: Repository<T>) { }

  async addConfig(data: BotData): Promise<T> {
    logger.info('Creating configuration', { botId: data.botId, method: 'addConfig' });
    try {
      const processedData = this.processData(data);
      const result = await this.repository.create(processedData);
      logger.info('Configuration created successfully', { botId: data.botId });
      return result;
    } catch (error) {
      handleError(error, 'Failed to create configuration', ErrorCodes.CONFIG_CREATION_FAILED.code, {
        botId: data.botId,
        data,
        method: 'addConfig',
      });
    }
  }

  async updateConfig(botId: string, data: Partial<BotData>): Promise<T> {
    logger.info('Updating configuration', { botId, method: 'updateConfig' });
    try {
      const processedData = this.processData(data);
      const result = await this.repository.update(botId, processedData);
      logger.info('Configuration updated successfully', { botId });
      return result;
    } catch (error) {
      handleError(error, 'Failed to update configuration', ErrorCodes.CONFIG_UPDATE_FAILED.code, {
        botId,
        data,
        method: 'updateConfig',
      });
    }
  }

  async deleteConfig(botId: string): Promise<T> {
    logger.info('Deleting configuration', { botId, method: 'deleteConfig' });
    try {
      const result = await this.repository.delete(botId);
      if (!result) {
        handleError(null, 'Configuration not found', ErrorCodes.NOT_FOUND.code, { botId, method: 'deleteConfig' });
      }
      logger.info('Configuration deleted successfully', { botId });
      return result;
    } catch (error) {
      handleError(error, 'Failed to delete configuration', ErrorCodes.DB_ERROR.code, { botId, method: 'deleteConfig' });
    }
  }

  async getConfig(botId: string): Promise<T | null> {
    logger.info('Retrieving configuration', { botId, method: 'getConfig' });
    try {
      const result = await this.repository.findById(botId);
      logger.info('Configuration retrieved', { botId, found: !!result });
      return result;
    } catch (error) {
      handleError(error, 'Failed to get configuration', ErrorCodes.DB_ERROR.code, { botId, method: 'getConfig' });
    }
  }

  async getAllConfigs(): Promise<T[]> {
    logger.info('Retrieving all configurations', { method: 'getAllConfigs' });
    try {
      const results = await this.repository.findAll();
      logger.info('All configurations retrieved', { count: results.length, method: 'getAllConfigs' });
      return results;
    } catch (error) {
      handleError(error, 'Failed to get all configurations', ErrorCodes.DB_ERROR.code, { method: 'getAllConfigs' });
    }
  }

  private processData(data: BotData): Partial<T> {
    if (!data) {
      throw new TradeBotError('Invalid configuration data', ErrorCodes.INVALID_CONFIG.code, { method: 'processData' });
    }

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
      if (!(data as any).botId) {
        throw new TradeBotError('Missing botId for targetAmounts', ErrorCodes.INVALID_CONFIG.code, {
          data,
          method: 'processData',
        });
      }
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

export const regularBotService = new BotService<Config>(new RegularConfigRepository());
export const multiBotService = new BotService<MultiConfig & { targetAmounts: TargetAmount[] }>(
  new MultiConfigRepository()
);