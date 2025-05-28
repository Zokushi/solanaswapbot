import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ENV } from './config/index.js';
import cors from 'cors';
import logger from './utils/logger.js';
import { ConfigService } from './services/configService.js';
import { getSingleTokenData } from './services/tokenDataService.js';
import { fetchTokenList } from './services/tokenDataService.js';
import prisma from './utils/prismaClient.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const configService = new ConfigService();

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

// API Endpoints
app.get('/api/configs', async (req, res) => {
  try {
    const configs = await configService.getAllConfigs();
    res.json(serializeForSocket(configs));
  } catch (error) {
    logger.error('Error fetching configs:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

app.get('/api/token/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const tokenData = await getSingleTokenData(mint);
    if (!tokenData) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.json(serializeForSocket(tokenData));
  } catch (error) {
    logger.error('Error fetching token data:', error);
    res.status(500).json({ error: 'Failed to fetch token data' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    logger.error('Socket error:', error);
  });

  // Handle config requests
  socket.on('config:get', async () => {
    try {
      const configs = await configService.getAllConfigs();
      socket.emit('config:update', serializeForSocket(configs));
    } catch (error) {
      logger.error('Error fetching configs for socket:', error);
      socket.emit('error', { message: 'Failed to fetch configurations' });
    }
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
    // Only log to server, don't broadcast to clients
    logger.info('Bot log:', serializeForSocket(data));
  });
});

// Start the server
const PORT = ENV.PORT || 4000;
const server = httpServer.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  try {
    await fetchTokenList(false); // Force update on server startup
    logger.info('Token list initialized');
  } catch (error) {
    logger.error('Failed to initialize token list:', error);
  }
});

// Handle cleanup and graceful shutdown
export const cleanup = async () => {
  logger.info('Starting server shutdown...');

  // Set a timeout to force shutdown if cleanup takes too long
  const forceShutdown = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 seconds timeout

  try {
    // Stop accepting new connections
    logger.info('Stopping new connections...');
    server.close();

    // Close all socket connections
    logger.info('Closing socket connections...');
    if (io) {
      // Disconnect all clients
      io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
      });
      io.close();
    }

    // Give some time for existing connections to close
    logger.info('Waiting for existing connections to close...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close the HTTP server
    if (server) {
      logger.info('Closing HTTP server...');
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server:', err);
            reject(err);
          } else {
            logger.info('HTTP server closed successfully');
            resolve();
          }
        });
      });
    }

    // Disconnect from database
    logger.info('Disconnecting from database...');
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');

    // Clear the force shutdown timeout
    clearTimeout(forceShutdown);

    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during cleanup:', error);
    process.exit(1);
  }
};

// Handle signals
const handleSignal = async (signal: string) => {
  logger.info(`Received ${signal} signal`);
  // Remove all listeners to prevent multiple cleanup calls
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  await cleanup();
};

// Set max listeners to a reasonable number
process.setMaxListeners(20);

// Remove any existing listeners first
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  cleanup();
}); 