import { Socket } from 'socket.io-client';
import { serializeForSocket } from '../utils/seralize.js';
import { createLogger } from '../utils/logger.js';

export class SocketService {
  private logger = createLogger('SocketService');

  constructor(private socket: Socket) {}

  emit(event: string, data: any): void {
    this.logger.info(`Emitting socket event: ${event}`);
    this.socket.emit(event, serializeForSocket(data));
  }
}