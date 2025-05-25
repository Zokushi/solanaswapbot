import prisma from "../utils/prismaClient.js";
import logger from "../utils/logger.js";
import type { Config, MultiConfig, TargetAmount, Prisma } from "@prisma/client";
import { PrismaClient } from '@prisma/client';

export class ConfigService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async addConfig(data: {
    botId: bigint;
    initialInputToken: string;
    initialOutputToken: string;
    initialInputAmount: number;
    firstTradePrice: number;
    targetGainPercentage: number;
    stopLossPercentage?: bigint;
  }) {
    try {
      const dbData = {
        ...data,
        stopLossPercentage: data.stopLossPercentage ?? null,
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
    botId: bigint;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: bigint;
    checkInterval?: number;
    targetAmounts: Record<string, number>;
  }) {
    try {
      const { targetAmounts, ...configData } = data;
      
      // Create the multi config first
      const newConfig = await this.prisma.multiConfig.create({
        data: {
          ...configData,
          stopLossPercentage: configData.stopLossPercentage ?? null,
          checkInterval: configData.checkInterval ?? null,
        }
      });

      // Then create target amounts with proper IDs
      const targetAmountEntries = Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
        id: BigInt(Date.now() + Math.floor(Math.random() * 1000)), // Generate unique ID
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
      console.error("Error adding new multi-bot configuration:", error);
      throw new Error("Failed to add multi-bot configuration");
    } finally {
      this.prisma.$disconnect();
    }
  }

  async getAllConfigs(): Promise<{
    regularBots: Array<Config & { status: string }>;
    multiBots: Array<MultiConfig & { status: string; targetAmounts: TargetAmount[] }>;
  }> {
    const regularBots = await this.prisma.config.findMany();
    const multiBots = await this.prisma.multiConfig.findMany({
      include: {
        targetAmounts: true
      }
    });

    return {
      regularBots: regularBots.map(bot => ({
        ...bot,
        status: "active" // Default or placeholder status, since 'status' does not exist on type
      })),
      multiBots: multiBots.map(bot => ({
        ...bot,
        status: "active" // Default or placeholder status, since 'status' does not exist on type
      }))
    };
  }

  async deleteConfig(botId: bigint) {
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

  async deleteMultiConfig(botId: bigint) {
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

  async updateBotConfig(botId: bigint, newConfig: Partial<Config>) {
    try {
      const updatedBot = await this.prisma.config.update({
        where: { botId },
        data: newConfig,
      });
      return updatedBot;
    } catch (error) {
      logger.error(`Failed to update bot configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Failed to update configuration");
    }
  }

  async updateMultiBotConfig(botId: bigint, newConfig: {
    initialInputToken?: string;
    initialInputAmount?: number;
    targetGainPercentage?: number;
    stopLossPercentage?: bigint;
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
          stopLossPercentage: configData.stopLossPercentage ?? null,
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
          id: BigInt(Date.now() + Math.floor(Math.random() * 1000)), // Generate unique ID
          tokenAddress,
          amount: Number(amount),
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

  async getMultiConfig(botId: bigint): Promise<MultiConfig | null> {
    return this.prisma.multiConfig.findUnique({
      where: { botId },
      include: {
        targetAmounts: true
      }
    });
  }

  async updateBotStatus(botId: bigint, status: 'active' | 'inactive'): Promise<void> {
    // Update regular bot status
    await this.prisma.$executeRaw`
      UPDATE Config SET status = ${status} WHERE botId = ${botId}
    `.catch(() => {
      // If regular bot not found, try updating multi bot
      return this.prisma.$executeRaw`
        UPDATE MultiConfig SET status = ${status} WHERE botId = ${botId}
      `;
    });
  }
}

export async function addConfig(data: {
  botId: bigint;
  initialInputToken: string;
  initialOutputToken: string;
  initialInputAmount: number;
  firstTradePrice: number;
  targetGainPercentage: number;
  stopLossPercentage?: bigint;
}) {
  try {
    const dbData = {
      ...data,
      stopLossPercentage: data.stopLossPercentage ?? null,
    };
    // Check if config exists
    const existingConfig = await prisma.config.findUnique({
      where: { botId: data.botId }
    });

    if (existingConfig) {
      // Update existing config
      const updatedConfig = await prisma.config.update({
        where: { botId: data.botId },
        data: dbData
      });
      return updatedConfig;
    }

    // Create new config if it doesn't exist
    const newConfig = await prisma.config.create({
      data: dbData
    });
    return newConfig;
  } catch (error) {
    logger.error(`Error adding new configuration: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error('Failed to add configuration');
  }
}

export async function addMultiConfig(data: {
  botId: bigint;
  initialInputToken: string;
  initialInputAmount: number;
  targetGainPercentage: number;
  stopLossPercentage?: bigint;
  checkInterval?: number;
  targetAmounts: Record<string, number>;
}) {
  try {
    const { targetAmounts, ...configData } = data;
    
    // Create the multi config first
    const newConfig = await prisma.multiConfig.create({
      data: {
        ...configData,
        stopLossPercentage: configData.stopLossPercentage ?? null,
        checkInterval: configData.checkInterval ?? null,
      }
    });

    // Then create target amounts with proper IDs
    const targetAmountEntries = Object.entries(targetAmounts).map(([tokenAddress, amount]) => ({
      id: BigInt(Date.now() + Math.floor(Math.random() * 1000)), // Generate unique ID
      tokenAddress,
      amount,
      configId: newConfig.botId
    }));

    if (targetAmountEntries.length > 0) {
      await prisma.targetAmount.createMany({
        data: targetAmountEntries
      });
    }

    return newConfig;
  } catch (error) {
    console.error("Error adding new multi-bot configuration:", error);
    throw new Error("Failed to add multi-bot configuration");
  } finally {
    prisma.$disconnect();
  }
}

export async function getAllConfigs() {
  try {
    logger.info('Fetching regular bot configurations...');
    const regularConfigs = await prisma.config.findMany();
    logger.info(`Found ${regularConfigs.length} regular bot configurations`);

    logger.info('Fetching multi-bot configurations...');
    const multiConfigs = await prisma.multiConfig.findMany({
      include: {
        targetAmounts: true,
      },
    });
    logger.info(`Found ${multiConfigs.length} multi-bot configurations`);

    return {
      regularBots: regularConfigs,
      multiBots: multiConfigs,
    };
  } catch (error) {
    logger.error("Error fetching configurations:", error);
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw new Error("Failed to fetch configurations");
  }
}

export async function getConfigById(botId: bigint) {
  try {
    const [regularConfig, multiConfig] = await Promise.all([
      prisma.config.findUnique({
        where: { botId },
      }),
      prisma.multiConfig.findUnique({
      where: { botId },
        include: {
          targetAmounts: true,
        },
      }),
    ]);
    return regularConfig || multiConfig;
  } catch (error) {
    console.error("Error fetching configuration by ID:", error);
    throw new Error("Failed to fetch configuration by ID");
  } finally {
    prisma.$disconnect();
  }
}
