import { io, Socket } from 'socket.io-client';
import { ENV } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { EventBus } from '../../services/eventBus.js';
import { BotManager } from '../../core/types.js';

export class CLISocket {
  private socket: Socket;
  private eventBus: EventBus;
  private isShuttingDown: boolean = false;
  private botManager: BotManager;

  constructor(botManager: BotManager) {
    this.socket = io(ENV.SOCKET_URL || 'http://localhost:4000');
    this.eventBus = new EventBus(this.socket);
    this.botManager = botManager;
  }

  async cleanup() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('[CLISocket] Starting cleanup...');

    try {
      this.eventBus.disconnect();
      logger.info('[CLISocket] Cleanup complete');
    } catch (error) {
      logger.error('[CLISocket] Error during cleanup:', error);
      throw error;
    }
  }

  emit(event: string, data: unknown) {
    if (this.isShuttingDown) {
      logger.warn('[CLISocket] Attempted to emit event during shutdown:', event);
      return;
    }
    this.eventBus.emit(event, data);
  }

  on(event: string, callback: (data: unknown) => void) {
    this.eventBus.on(event as any, callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    this.eventBus.off(event as any, callback);
  }

  disconnect() {
    this.cleanup();
  }

  getSocket(): Socket {
    return this.socket;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  async startBot(botId: string, type: 'regular' | 'multi'): Promise<void> {
    try {
      const config = await this.botManager.getConfig(botId, type);
      if (!config) {
        throw new Error(`No configuration found for bot ${botId}`);
      }

      if (type === 'multi') {
        await this.botManager.startMultiBot(config, this.socket);
      } else {
        await this.botManager.startBot(config, this.socket);
      }
    } catch (error) {
      logger.error(`[CLISocket] Failed to start bot ${botId}:`, error);
      throw error;
    }
  }

  async stopBot(botId: string): Promise<void> {
    await this.botManager.stopBot(botId);
  }

  async deleteConfig(botId: string, type: 'regular' | 'multi'): Promise<void> {
    await this.botManager.deleteConfig(botId, type);
  }
} 