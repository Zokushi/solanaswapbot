import { Socket } from 'socket.io-client';
import { createLogger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { ErrorCodes } from '../utils/errors.js';
export class EventBus {
  private socket: Socket;
  private logger = createLogger('EventBus');
  private eventQueue: Array<{ event: string; data: unknown }> = [];

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      this.logger.info('Socket connected', { method: 'socketConnect', socketId: this.socket.id });
      // Process queued events when socket reconnects
      while (this.eventQueue.length > 0) {
        const { event, data } = this.eventQueue.shift()!;
        this.logger.debug('Processing queued event', { method: 'connect', event });
        this.socket.emit(event, data);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.info('Socket disconnected', { method: 'socketDisconnect', reason, socketId: this.socket.id });
    });

    this.socket.on('error', (err: any) => {
      handleError(err, 'Socket error', ErrorCodes.API_ERROR.code, {
        method: 'socketError',
        error: err.message,
        socketId: this.socket.id,
      });
    });

    this.socket.on('connect_error', (err: any) => {
      handleError(err, 'Socket connection error', ErrorCodes.API_ERROR.code, {
        method: 'socketConnectError',
        error: err.message,
        socketId: this.socket.id,
      });
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      this.logger.debug('Reconnect attempt', { method: 'reconnectAttempt', attempt });
    });

    this.socket.on('reconnect_failed', () => {
      this.logger.error('Reconnect failed after max attempts', { method: 'reconnectFailed' });
    });
  }

 

  emit(event: string, data: unknown) {
    if (!this.socket.connected) {
      this.logger.warn('Queueing event, socket disconnected', { method: 'emit', event });
      this.eventQueue.push({ event, data });
      return;
    }
    this.socket.emit(event, data);
    this.logger.debug('Emitted event', { method: 'emit', event });
  }

  on(event: string, callback: (data: unknown) => void) {
    this.socket.on(event, (data: unknown) => {
      this.logger.debug('Received event', { method: 'on', event, hasData: !!data });
      callback(data);
    });
    this.logger.debug('Registered listener', { method: 'on', event });
  }

  off(event: string, callback: (data: unknown) => void) {
    this.socket.off(event, callback);
    this.logger.debug('Unregistered listener', { method: 'off', event });
  }

  disconnect() {
    this.socket.disconnect();
    this.logger.info('Socket disconnected manually', { method: 'disconnect' });
    this.eventQueue = [];
  }
}