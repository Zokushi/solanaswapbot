import { io, Socket } from 'socket.io-client';
import { ENV } from '../../config/index.js';
import { EventBus } from '../../services/eventBus.js';
import { BotManager } from '../../core/types.js';
import { createLogger } from '../../utils/logger.js';
import { ErrorCodes } from '../../utils/errors.js';
import { handleError } from '../../utils/errorHandler.js';

const logger = createLogger('CLISocket');

export class CLISocket {
  private socket: Socket;
  private eventBus: EventBus;
  private isShuttingDown: boolean = false;
  private botManager: BotManager;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(botManager: BotManager) {
    this.botManager = botManager;
    this.socket = io(ENV.SOCKET_URL || 'http://localhost:4000', {
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.eventBus = new EventBus(this.socket);
    this.setupReconnectHandlers();
  }

  private setupReconnectHandlers() {
    this.socket.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempts = attempt;
      logger.debug('Reconnect attempt', { method: 'reconnectAttempt', attempt });
    });

    this.socket.on('reconnect_failed', () => {
      logger.error('Reconnect failed after max attempts', {
        method: 'reconnectFailed',
        attempts: this.reconnectAttempts,
      });
      this.disconnect();
    });
  }

  async cleanup() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Starting cleanup', { method: 'cleanup' });
    try {
      this.eventBus.disconnect();
      logger.info('Cleanup complete', { method: 'cleanup' });
    } catch (error) {
      handleError(error, 'Error during cleanup', ErrorCodes.API_ERROR.code, { method: 'cleanup' });
    }
  }

  emit(event: string, data: unknown) {
    if (this.isShuttingDown) {
      logger.warn('Attempted to emit event during shutdown', { method: 'emit', event });
      return;
    }
    this.eventBus.emit(event, data);
  }

  on(event: string, callback: (data: unknown) => void) {
    this.eventBus.on(event, callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    this.eventBus.off(event, callback);
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

  async stopBot(botId: string): Promise<void> {
    logger.info('Stopping bot', { method: 'stopBot', botId });
    await this.botManager.stopBot(botId);
  }

  async deleteConfig(botId: string, type: 'regular' | 'multi'): Promise<void> {
    logger.info('Deleting config', { method: 'deleteConfig', botId, type });
    await this.botManager.deleteConfig(botId, type);
  }
}