import { Socket, io } from 'socket.io-client';
import { ENV } from '../../config/index.js';
import logger from '../../utils/logger.js';

export class CLISocket {
  private socket: Socket;
  private eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private isShuttingDown: boolean = false;

  constructor() {
    // Connect to the server using the correct port from ENV
    this.socket = io(`http://localhost:${ENV.PORT || 4000}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    // Set up socket event handlers
    this.socket.on('connect', () => {
      logger.info('[CLISocket] Connected to server');
    });

    this.socket.on('disconnect', () => {
      if (!this.isShuttingDown) {
        logger.warn('[CLISocket] Disconnected from server');
      }
    });

    this.socket.on('error', (error: Error) => {
      logger.error('[CLISocket] Socket error:', error);
    });

    // Forward all events from the socket to our handlers
    this.socket.onAny((event: string, data: unknown) => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.forEach(callback => callback(data));
      }
    });

    // Set up signal handlers
    this.setupSignalHandlers();
  }

  private setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM'] as const;
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`[CLISocket] Received ${signal} signal`);
        await this.cleanup();
        process.exit(0);
      });
    });

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      logger.error('[CLISocket] Uncaught Exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error('[CLISocket] Unhandled Rejection:', reason);
      await this.cleanup();
      process.exit(1);
    });
  }

  async cleanup() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('[CLISocket] Starting cleanup...');

    try {
      // Remove all event listeners
      this.eventHandlers.clear();
      
      // Disconnect the socket
      if (this.socket.connected) {
        logger.info('[CLISocket] Disconnecting socket...');
        this.socket.disconnect();
      }

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
    this.socket.emit(event, data);
  }

  on(event: string, callback: (data: unknown) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  disconnect() {
    this.cleanup();
  }

  getSocket(): Socket {
    return this.socket;
  }
} 