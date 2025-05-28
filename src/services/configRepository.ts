import { PrismaClient, Config, MultiConfig, TargetAmount } from '@prisma/client';
import { PrismaRepository } from './repository.js';

export class RegularConfigRepository extends PrismaRepository<Config> {
  constructor() {
    super(new PrismaClient().config);
  }
}

export class MultiConfigRepository extends PrismaRepository<MultiConfig & { targetAmounts: TargetAmount[] }> {
  constructor() {
    super(new PrismaClient().multiConfig);
  }

  async create(data: Partial<MultiConfig & { targetAmounts: Partial<TargetAmount>[] }>): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    const { targetAmounts, ...configData } = data;
    const config = await this.model.create({ data: configData });
    
    if (targetAmounts && targetAmounts.length > 0) {
      await this.prisma.targetAmount.createMany({
        data: targetAmounts.map(ta => ({
          configId: config.botId,
          tokenAddress: ta.tokenAddress || '',
          tokenName: ta.tokenName || ta.tokenAddress || '',
          amount: ta.amount || 0
        }))
      });
    }

    return this.findById(config.botId) as Promise<MultiConfig & { targetAmounts: TargetAmount[] }>;
  }

  async update(id: string, data: Partial<MultiConfig & { targetAmounts: Partial<TargetAmount>[] }>): Promise<MultiConfig & { targetAmounts: TargetAmount[] }> {
    const { targetAmounts, ...configData } = data;
    
    // Update the main config
    const config = await this.model.update({
      where: { botId: id },
      data: configData
    });

    // Update target amounts if provided
    if (targetAmounts) {
      // Delete existing target amounts
      await this.prisma.targetAmount.deleteMany({
        where: { configId: id }
      });

      // Create new target amounts
      if (targetAmounts.length > 0) {
        await this.prisma.targetAmount.createMany({
          data: targetAmounts.map(ta => ({
            configId: id,
            tokenAddress: ta.tokenAddress || '',
            tokenName: ta.tokenName || ta.tokenAddress || '',
            amount: ta.amount || 0
          }))
        });
      }
    }

    return this.findById(id) as Promise<MultiConfig & { targetAmounts: TargetAmount[] }>;
  }

  async findById(id: string): Promise<(MultiConfig & { targetAmounts: TargetAmount[] }) | null> {
    return this.model.findUnique({
      where: { botId: id },
      include: { targetAmounts: true }
    });
  }

  async findAll(): Promise<(MultiConfig & { targetAmounts: TargetAmount[] })[]> {
    return this.model.findMany({
      include: { targetAmounts: true }
    });
  }
} 