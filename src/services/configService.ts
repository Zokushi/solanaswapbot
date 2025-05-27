import { PrismaClient, Config, MultiConfig, TargetAmount } from '@prisma/client';
import logger from '../utils/logger.js';

export class ConfigService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  private convertStopLossPercentage(value: bigint | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'bigint' ? Number(value) : value;
  }

  async addConfig(data: {
    botId: string;
    initialInputToken: string;
    initialOutputToken: string;
    initialInputAmount: number;
    firstTradePrice: number;
    targetGainPercentage: number;
    stopLossPercentage?: bigint | number;
  }) {
    try {
      const dbData = {
        ...data,
        stopLossPercentage: this.convertStopLossPercentage(data.stopLossPercentage),
      };
      // Check if config exists
      const existingConfig = await this.prisma.config.findUnique({
        where: { botId: data.botId }
      });

      if (existingConfig) {
        // Update existing config
        const updatedConfig = await this.prisma.config.update({
          where: { botId: data.botId },
          data: dbData
        });
        return updatedConfig;
      }

      // Create new config if it doesn't exist
      const newConfig = await this.prisma.config.create({
        data: dbData
      });
      return newConfig;
    } catch (error) {
      logger.error(`Error adding new configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to add configuration');
    }
  }

  async addMultiConfig(data: {
    botId: string;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: bigint | number;
    checkInterval?: number;
    targetAmounts: Record<string, number>;
  }) {
    try {
      const { targetAmounts, ...configData } = data;
      
      // Create the multi config first
      const newConfig = await this.prisma.multiConfig.create({
        data: {
          ...configData,
          stopLossPercentage: this.convertStopLossPercentage(configData.stopLossPercentage),
          checkInterval: configData.checkInterval ?? null,
        }
      });

      // Then create target amounts with proper IDs
      const targetAmountEntries = Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
        tokenAddress,
        amount,
        configId: newConfig.botId
      }));

      if (targetAmountEntries.length > 0) {
        await this.prisma.targetAmount.createMany({
          data: targetAmountEntries
        });
      }

      return newConfig;
    } catch (error) {
      logger.error("Error adding new multi-bot configuration:", error);
      throw new Error("Failed to add multi-bot configuration");
    }
  }

  async getAllConfigs(): Promise<{
    regularBots: Array<Config & { status: string }>;
    multiBots: Array<MultiConfig & { status: string; targetAmounts: TargetAmount[] }>;
  }> {
    try {
      const regularBots = await this.prisma.config.findMany();
      const multiBots = await this.prisma.multiConfig.findMany({
        include: {
          targetAmounts: true
        }
      });

      return {
        regularBots: regularBots.map((bot: Config) => ({
          ...bot,
          status: "inactive" // Default status
        })),
        multiBots: multiBots.map((bot: MultiConfig & { targetAmounts: TargetAmount[] }) => ({
          ...bot,
          status: "inactive" // Default status
        }))
      };
    } catch (error) {
      logger.error(`Error getting all configurations: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to get configurations');
    }
  }

  async deleteConfig(botId: string) {
    try {
      const deletedConfig = await this.prisma.config.delete({
        where: { botId },
      });
      return deletedConfig;
    } catch (error) {
      logger.error(`Error deleting configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to delete configuration");
    }
  }

  async deleteMultiConfig(botId: string) {
    try {
      const deletedConfig = await this.prisma.multiConfig.delete({
        where: { botId },
      });
      return deletedConfig;
    } catch (error) {
      logger.error(`Error deleting multi-bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to delete multi-bot configuration");
    }
  }

  async updateBotConfig(botId: string, newConfig: Partial<Config>) {
    try {
      const updatedBot = await this.prisma.config.update({
        where: { botId },
        data: {
          ...newConfig,
          stopLossPercentage: this.convertStopLossPercentage(newConfig.stopLossPercentage as bigint | number | null | undefined)
        },
      });
      return updatedBot;
    } catch (error) {
      logger.error(`Failed to update bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to update configuration");
    }
  }

  async updateMultiBotConfig(botId: string, newConfig: {
    initialInputToken?: string;
    initialInputAmount?: number;
    targetGainPercentage?: number;
    stopLossPercentage?: bigint | number;
    checkInterval?: number;
    targetAmounts?: Record<string, number>;
  }) {
    try {
      const { targetAmounts, ...configData } = newConfig;

      // Update the multi config
      const updatedConfig = await this.prisma.multiConfig.update({
        where: { botId },
        data: {
          ...configData,
          stopLossPercentage: this.convertStopLossPercentage(configData.stopLossPercentage),
          checkInterval: configData.checkInterval ?? null,
        },
        include: {
          targetAmounts: true,
        },
      });

      // If target amounts are provided, update them
      if (targetAmounts) {
        // Remove old target amounts
        await this.prisma.targetAmount.deleteMany({
          where: { configId: botId }
        });

        // Add new target amounts
        const targetAmountEntries = Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
          tokenAddress,
          amount,
          configId: botId
        }));

        if (targetAmountEntries.length > 0) {
          await this.prisma.targetAmount.createMany({
            data: targetAmountEntries
          });
        }
      }

      return updatedConfig;
    } catch (error) {
      logger.error(`Failed to update multi-bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to update multi-bot configuration");
    }
  }

  async getMultiConfig(botId: string): Promise<MultiConfig | null> {
    try {
      return await this.prisma.multiConfig.findUnique({
        where: { botId },
        include: {
          targetAmounts: true
        }
      });
    } catch (error) {
      logger.error(`Error getting multi-config: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to get multi-config");
    }
  }

  async updateBotStatus(botId: string, status: 'active' | 'inactive'): Promise<void> {
    try {
      // Update regular bot status
      await this.prisma.$executeRaw`
        UPDATE Config SET status = ${status} WHERE botId = ${botId}
      `.catch(() => {
        // If regular bot not found, try updating multi bot
        return this.prisma.$executeRaw`
          UPDATE MultiConfig SET status = ${status} WHERE botId = ${botId}
        `;
      });
    } catch (error) {
      logger.error(`Error updating bot status: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to update bot status");
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}
