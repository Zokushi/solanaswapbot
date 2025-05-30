import { TokenInfo } from '../core/types.js';
import prisma from '../utils/prismaClient.js';
import { createLogger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { TradeBotError, ErrorCodes } from '../utils/errors.js';

const logger = createLogger('TokenDataService');

const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const RATE_LIMIT_INTERVAL = 60 * 1000;
const BATCH_SIZE = 50; // Process tokens in batches

let lastApiCall: number | null = null;

export async function fetchTokenList(forceUpdate: boolean = false) {
  logger.debug('Checking token list update', { method: 'fetchTokenList', forceUpdate });
  try {
    const lock = await prisma.metadata.findUnique({
      where: { key: 'token_update_lock' },
    });

    if (lock?.value === 'locked' && !forceUpdate) {
      logger.debug('Token list update already in progress, skipping', { method: 'fetchTokenList' });
      return;
    }

    await prisma.metadata.upsert({
      where: { key: 'token_update_lock' },
      update: { value: 'locked' },
      create: { key: 'token_update_lock', value: 'locked' },
    });

    const now = Date.now();
    if (lastApiCall && now - lastApiCall < RATE_LIMIT_INTERVAL && !forceUpdate) {
      logger.debug('Rate limit enforced, skipping update', { method: 'fetchTokenList' });
      await prisma.metadata.delete({ where: { key: 'token_update_lock' } });
      return;
    }

    const lastUpdate = await prisma.token.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    const currentTime = new Date();
    const lastUpdateTime = lastUpdate?.updatedAt || new Date(0);
    const shouldUpdate =
      forceUpdate || !lastUpdate || currentTime.getTime() - lastUpdateTime.getTime() > UPDATE_INTERVAL;

    if (!shouldUpdate) {
      logger.info('Token list is up to date, skipping update', { method: 'fetchTokenList' });
      await prisma.metadata.delete({ where: { key: 'token_update_lock' } });
      return;
    }

    logger.info('Fetching latest token data from Jupiter API', { method: 'fetchTokenList' });
    const response = await fetch('https://lite-api.jup.ag/tokens/v1/tagged/verified');
    if (!response.ok) {
      handleError(
        null,
        `Failed to fetch token list: HTTP ${response.status}`,
        ErrorCodes.API_ERROR.code,
        { method: 'fetchTokenList', status: response.status },
      );
    }
    const lstTaggedResponse = await response.json();

    if (Array.isArray(lstTaggedResponse)) {
      logger.info('Updating token list', { method: 'fetchTokenList', tokenCount: lstTaggedResponse.length });
      const tokens = lstTaggedResponse as TokenInfo[];
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        logger.debug('Processing token batch', { method: 'fetchTokenList', batchSize: batch.length, batchIndex: i });
        await Promise.all(
          batch.map((token) =>
            updateTokenData(token).catch((error) => {
              handleError(error, 'Failed to update token data', ErrorCodes.DB_ERROR.code, {
                method: 'updateTokenData',
                address: token.address,
              });
            }),
          ),
        );
      }
    } else {
      logger.info('Updating single token', { method: 'fetchTokenList' });
      await updateTokenData(lstTaggedResponse as TokenInfo);
    }

    logger.info('Token list updated successfully', { method: 'fetchTokenList' });
    lastApiCall = now;
  } catch (error) {
    handleError(error, 'Failed to fetch token list', ErrorCodes.API_ERROR.code, { method: 'fetchTokenList' });
  } finally {
    await prisma.metadata.delete({ where: { key: 'token_update_lock' } });
  }
}

export async function updateTokenData(tokenInfo: TokenInfo) {
  logger.debug('Updating token data', { method: 'updateTokenData', address: tokenInfo.address }); // Changed to debug
  try {
    if (!tokenInfo.address) {
      throw new TradeBotError('Token address is required', ErrorCodes.INVALID_CONFIG.code, {
        method: 'updateTokenData',
        tokenInfo,
      });
    }

    const existingToken = await prisma.token.findUnique({
      where: { address: tokenInfo.address },
    });

    const tokenData = existingToken
      ? await prisma.token.update({
          where: { id: existingToken.id },
          data: {
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
            logoURI: tokenInfo.logoURI,
            updatedAt: new Date(),
          },
        })
      : await prisma.token.create({
          data: {
            address: tokenInfo.address,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
            logoURI: tokenInfo.logoURI,
            updatedAt: new Date(),
          },
        });

    logger.debug('Token data updated successfully', { method: 'updateTokenData', address: tokenInfo.address }); // Changed to debug
    return tokenData;
  } catch (error) {
    handleError(error, 'Failed to update token data', ErrorCodes.DB_ERROR.code, {
      method: 'updateTokenData',
      address: tokenInfo.address,
    });
  }
}
export async function getTokenDataList() {
  logger.info('Retrieving token data list', { method: 'getTokenDataList' });
  try {
    const tokenDataList = await prisma.token.findMany();
    logger.info('Token data list retrieved', { method: 'getTokenDataList', count: tokenDataList.length });
    return tokenDataList;
  } catch (error) {
    handleError(error, 'Failed to fetch token data list', ErrorCodes.DB_ERROR.code, { method: 'getTokenDataList' });
  }
}

export async function getSingleTokenData(address: string) {
  logger.info('Retrieving single token data', { method: 'getSingleTokenData', address });
  try {
    if (!address) {
      throw new TradeBotError('Token address is required', ErrorCodes.INVALID_CONFIG.code, {
        method: 'getSingleTokenData',
      });
    }

    const tokenData = await prisma.token.findUnique({
      where: { address },
    });
    logger.info('Single token data retrieved', { method: 'getSingleTokenData', address, found: !!tokenData });
    return tokenData;
  } catch (error) {
    handleError(error, 'Failed to fetch single token data', ErrorCodes.DB_ERROR.code, {
      method: 'getSingleTokenData',
      address,
    });
  }
}