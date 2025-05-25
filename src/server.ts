import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ENV } from './config/index.js';
import cors from 'cors';
import logger from './utils/logger.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Helper function to serialize data for socket transmission
const serializeForSocket = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'bigint') {
    return data.toString();
  }
  
  if (Array.isArray(data)) {
    return data.map(serializeForSocket);
  }
  
  if (typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeForSocket(value);
    }
    return result;
  }
  
  return data;
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    logger.error('Socket error:', error);
  });

  // Handle bot events
  socket.on('bot:start', (data) => {
    logger.info('Bot start requested:', serializeForSocket(data));
    socket.emit('bot:start', serializeForSocket(data));
  });

  socket.on('bot:stop', (data) => {
    logger.info('Bot stop requested:', serializeForSocket(data));
    socket.emit('bot:stop', serializeForSocket(data));
  });

  socket.on('bot:difference', (data) => {
    // Broadcast the difference update to all connected clients
    io.emit('bot:difference', serializeForSocket(data));
  });

  socket.on('log', (data) => {
    logger.info('Bot log:', serializeForSocket(data));
    io.emit('log', serializeForSocket(data));
  });
});

// Start the server
const PORT = ENV.PORT || 4000;
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 