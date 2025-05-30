import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ENV } from './config/index.js';
import cors from 'cors';
import { ConfigService } from './services/configService.js';
import { getSingleTokenData, fetchTokenList } from './services/tokenDataService.js';
import prisma from './utils/prismaClient.js';
import { createLogger } from './utils/logger.js';
import { handleError } from './utils/errorHandler.js';
import { TradeBotError, ErrorCodes } from './utils/errors.js';
import { TransactionService } from './services/transactionService.js';

const logger = createLogger('Server');
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const configService = new ConfigService();
const transactionService = new TransactionService();
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
  logger.info('Fetching all configs', { method: 'getConfigs' });
  try {
    const configs = await configService.getAllConfigs();
    res.json(serializeForSocket(configs));
  } catch (error) {
    handleError(error, 'Failed to fetch configurations', ErrorCodes.DB_ERROR.code, { method: 'getConfigs' });
  }
});

app.get('/api/token/:mint', async (req, res) => {
  logger.info('Fetching token data', { method: 'getToken', mint: req.params.mint });
  try {
    const { mint } = req.params;
    if (!mint) {
      throw new TradeBotError('Mint address is required', ErrorCodes.INVALID_CONFIG.code, { method: 'getToken' });
    }
    const tokenData = await getSingleTokenData(mint);
    if (!tokenData) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.json(serializeForSocket(tokenData));
  } catch (error) {
    handleError(error, 'Failed to fetch token data', ErrorCodes.DB_ERROR.code, { method: 'getToken', mint: req.params.mint });
  }
});

io.on('connection', (socket) => {
  logger.info('Client connected', { method: 'socketConnection', socketId: socket.id });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { method: 'socketDisconnect', socketId: socket.id });
  });

  socket.on('error', (error) => {
    handleError(error, 'Socket error', ErrorCodes.API_ERROR.code, { method: 'socketError', socketId: socket.id });
  });

  socket.on('config:get', async () => {
    logger.info('Fetching configs for socket', { method: 'socketConfigGet', socketId: socket.id });
    try {
      const configs = await configService.getAllConfigs();
      logger.info('Sending config response', {
        method: 'socketConfigGet',
        socketId: socket.id,
        regularCount: configs.regularBots.length,
        multiCount: configs.multiBots.length,
      });
      socket.emit('config:response', serializeForSocket(configs)); // Changed to config:response
    } catch (error) {
      handleError(error, 'Failed to fetch configurations for socket', ErrorCodes.DB_ERROR.code, {
        method: 'socketConfigGet',
        socketId: socket.id,
      });
    }
  });

  socket.on('config:edit', async (data) => {
    logger.info('Config edit requested', { method: 'socketConfigEdit', socketId: socket.id, data });
    try {
      await configService.updateBotConfig(data.config.botId, data.config);
      const configs = await configService.getAllConfigs();
      socket.emit('config:update', serializeForSocket(configs)); // Used for edit updates
    } catch (error) {
      handleError(error, 'Failed to update configuration', ErrorCodes.DB_ERROR.code, {
        method: 'socketConfigEdit',
        socketId: socket.id,
      });
    }
  });

  socket.on('bot:start', (data) => {
    logger.info('Bot start requested', { method: 'socketBotStart', socketId: socket.id, data });
    socket.emit('bot:start', serializeForSocket(data));
  });

  socket.on('bot:stop', (data) => {
    logger.info('Bot stop requested', { method: 'socketBotStop', socketId: socket.id, data });
    socket.emit('bot:stop', serializeForSocket(data));
  });

  socket.on('bot:difference', (data) => {
    logger.info('Bot difference update', { method: 'socketBotDifference', socketId: socket.id });
    io.emit('bot:difference', serializeForSocket(data));
  });

  socket.on('log', (data) => {
    logger.info('Bot log received', { method: 'socketLog', socketId: socket.id, data });
  });

  socket.on('transaction:get', async () => {
    logger.info('Fetching transactions for socket', { method: 'socketTransactionGet', socketId: socket.id });
    try {
      const transactions = await transactionService.handleGetTransactions();
      logger.info('Sending transaction response', {
        method: 'socketTransactionGet',
        socketId: socket.id,
        transactionCount: transactions.transactions.length,
      });
      socket.emit('transaction:response', serializeForSocket(transactions)); // Changed to transaction:response
    } catch (error) {
      handleError(error, 'Failed to fetch transactions for socket', ErrorCodes.DB_ERROR.code, {
        method: 'socketTransactionGet',
        socketId: socket.id,
      });
    }
  });
});
async function initializeTokens() {
  logger.info('Checking token list initialization', { method: 'initializeTokens' });
  try {
    await prisma.$connect();
    logger.debug('Database connection established', { method: 'initializeTokens' });

    const metadata = await prisma.metadata.findUnique({
      where: { key: 'tokens_seeded' },
    });

    if (metadata?.value === 'true') {
      const tokenCount = await prisma.token.count();
      logger.info('Token list already seeded', { method: 'initializeTokens', tokenCount });
      if (tokenCount === 0) {
        logger.warn('Tokens seeded flag set but no tokens found, resetting flag', { method: 'initializeTokens' });
        await prisma.metadata.delete({ where: { key: 'tokens_seeded' } });
      } else {
        return;
      }
    }

    logger.info('No seeding record found, checking token count', { method: 'initializeTokens' });
    const tokenCount = await prisma.token.count();
    if (tokenCount === 0) {
      logger.info('No tokens found, seeding initial token list', { method: 'initializeTokens' });
      const lock = await prisma.metadata.upsert({
        where: { key: 'token_seed_lock' },
        update: { value: 'locked' },
        create: { key: 'token_seed_lock', value: 'locked' },
      });

      if (lock.value !== 'locked') {
        logger.info('Token seeding already in progress, skipping', { method: 'initializeTokens' });
        return;
      }

      try {
        await fetchTokenList(true);
        const newTokenCount = await prisma.token.count();
        logger.info('Token list seeded successfully', { method: 'initializeTokens', newTokenCount });
        if (newTokenCount === 0) {
          throw new TradeBotError('Seeding completed but no tokens inserted', ErrorCodes.DB_ERROR.code, {
            method: 'initializeTokens',
          });
        }
        await prisma.metadata.upsert({
          where: { key: 'tokens_seeded' },
          update: { value: 'true' },
          create: { key: 'tokens_seeded', value: 'true' },
        });
      } finally {
        await prisma.metadata.delete({ where: { key: 'token_seed_lock' } });
      }
    } else {
      logger.info('Tokens found, marking as seeded', { method: 'initializeTokens', count: tokenCount });
      await prisma.metadata.upsert({
        where: { key: 'tokens_seeded' },
        update: { value: 'true' },
        create: { key: 'tokens_seeded', value: 'true' },
      });
    }
  } catch (error) {
    handleError(error, 'Failed to initialize token list', ErrorCodes.DB_ERROR.code, { method: 'initializeTokens' });
  }
}

const PORT = ENV.PORT || 4000;
httpServer.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`, { method: 'startServer' });
  try {
    await initializeTokens();
  } catch (error) {
    logger.error('Server startup failed due to token initialization error', { method: 'startServer', error });
    process.exit(1);
  }
});

export const cleanup = async () => {
  logger.info('Starting server shutdown', { method: 'cleanup' });
  const forceShutdown = setTimeout(() => {
    logger.error('Forced shutdown after timeout', { method: 'cleanup' });
    process.exit(1);
  }, 10000);

  try {
    logger.info('Stopping new connections', { method: 'cleanup' });
    httpServer.close();

    logger.info('Closing socket connections', { method: 'cleanup' });
    if (io) {
      io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
      });
      io.close();
    }

    logger.info('Waiting for existing connections to close', { method: 'cleanup' });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    logger.info('Disconnecting from database', { method: 'cleanup' });
    await prisma.$disconnect();
    logger.info('Database disconnected successfully', { method: 'cleanup' });

    clearTimeout(forceShutdown);
    logger.info('Server shutdown complete', { method: 'cleanup' });
    process.exit(0);
  } catch (error) {
    handleError(error, 'Error during cleanup', ErrorCodes.API_ERROR.code, { method: 'cleanup' });
  }
};

const handleSignal = async (signal: string) => {
  logger.info(`Received ${signal} signal`, { method: 'handleSignal' });
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  await cleanup();
};

process.setMaxListeners(20);
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

process.on('uncaughtException', (error) => {
  handleError(error, 'Uncaught Exception', ErrorCodes.API_ERROR.code, { method: 'uncaughtException' });
});

process.on('unhandledRejection', (reason, promise) => {
  handleError(reason, 'Unhandled Rejection', ErrorCodes.API_ERROR.code, { method: 'unhandledRejection', promise });
});