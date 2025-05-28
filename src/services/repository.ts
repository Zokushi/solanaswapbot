import { PrismaClient } from '@prisma/client';

/**
 * Repository interface defining the contract for data access operations.
 * This interface ensures consistent data access patterns across different repositories.
 */
export interface Repository<T> {
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
}

/**
 * PrismaRepository provides a base implementation of the Repository interface using Prisma.
 * 
 * Responsibilities:
 * - Provides basic CRUD operations using Prisma
 * - Handles database connections
 * - Can be extended for specific entity types
 */
export abstract class PrismaRepository<T> implements Repository<T> {
  protected prisma: PrismaClient;
  protected model: any; // Prisma model type

  constructor(model: any) {
    this.prisma = new PrismaClient();
    this.model = model;
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return this.model.update({
      where: { botId: id },
      data
    });
  }

  async delete(id: string): Promise<T> {
    return this.model.delete({
      where: { botId: id }
    });
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({
      where: { botId: id }
    });
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany();
  }
} 