import { Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

export type BotData = {
  botId: string;
  status: string;
  inputMint: string;
  outputMint: string;
  currentPrice: number;
  targetTrade: number;
  difference: number;
  ratio: number;
  trades: number;
  tokenInPrice?: number;
  tokenOutPrice?: number;
  targetMint?: string;
  targetAmounts?: any[];
};

export type ConfigData = {
  regularBots: Array<{
    botId: string;
    initialInputToken: string;
    initialOutputToken: string;
    initialInputAmount: number;
    firstTradePrice: number | bigint;
    targetGainPercentage: number;
    stopLossPercentage?: number;
    status: string;
  }>;
  multiBots: Array<{
    botId: string;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: number;
    checkInterval?: number;
    status: string;
    targetAmounts: Array<{
      id: string;
      configId: string;
      tokenAddress: string;
      amount: number;
    }>;
  }>;
};

export class EventBus {
  private emitter: EventEmitter;
  private socket: Socket;

  constructor(socket: Socket) {
    this.emitter = new EventEmitter();
    this.socket = socket;
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('config:update', (data: ConfigData) => {
      logger.info('Received config:update event');
      this.emitter.emit('configUpdate', data);
    });

    this.socket.on('bot:difference', (data: BotData) => {
      logger.info('Received bot:difference event');
      this.emitter.emit('botDifference', data);
    });

    this.socket.on('error', (error: Error) => {
      logger.error('Socket error:', error);
      this.emitter.emit('error', error);
    });

    this.socket.on('bot:start', (data: any) => {
      logger.info('Received bot:start event');
      this.emitter.emit('botStart', data);
    });

    this.socket.on('bot:stop', (data: any) => {
      logger.info('Received bot:stop event');
      this.emitter.emit('botStop', data);
    });

    this.socket.on('disconnect', () => {
      logger.warn('Socket disconnected');
      this.emitter.emit('error', new Error('Socket disconnected'));
    });
  }

  on(event: 'configUpdate' | 'botDifference' | 'error' | 'botStart' | 'botStop', handler: (data: any) => void) {
    this.emitter.on(event, handler);
  }

  off(event: 'configUpdate' | 'botDifference' | 'error' | 'botStart' | 'botStop', handler: (data: any) => void) {
    this.emitter.off(event, handler);
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }

  disconnect() {
    this.socket.disconnect();
    this.emitter.removeAllListeners();
  }
} 