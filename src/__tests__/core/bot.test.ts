import { TradeBot } from '../../core/bot.js';
import { QuoteResponse, NextTrade } from '../../core/types.js';
import { NotificationService } from '../../services/notificationService.js';
import { ConfigService } from '../../services/configService.js';
import { Socket } from 'socket.io-client';
import { jest } from '@jest/globals';

// Shared mock factory
const createMockDependencies = () => ({
  socket: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  } as unknown as jest.Mocked<Socket>,
  notificationService: {
    log: jest.fn(),
    emit: jest.fn(),
    logSwap: jest.fn(),
  } as unknown as jest.Mocked<NotificationService>,
  configService: {
    updateBotConfig: jest.fn(),
  } as unknown as jest.Mocked<ConfigService>,
  wallet: {
    publicKey: { algorithm: { name: 'ECDSA', namedCurve: 'P-256' }, extractable: true, type: 'public', usages: ['verify'] },
    privateKey: { algorithm: { name: 'ECDSA', namedCurve: 'P-256' }, extractable: true, type: 'private', usages: ['sign'] },
  } as CryptoKeyPair,
});

// Base bot configuration
const baseBotConfig = {
  botId: 'test-bot',
  rpc: {} as any,
  subscriptions: {} as any,
  firstTradePrice: 1000,
  targetGainPercentage: 1,
  initialInputToken: 'input-token',
  initialInputAmount: 1000,
  initialOutputToken: 'output-token',
};

// Base quote response
const baseQuote: QuoteResponse = {
  inputMint: 'input-token',
  inAmount: '1000000',
  outputMint: 'output-token',
  outAmount: '1010000',
  otherAmountThreshold: '0',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.1',
  routePlan: [],
};

jest.mock('../../services/notificationService');
jest.mock('../../services/configService');
jest.mock('socket.io-client');

describe('TradeBot', () => {
  let bot: TradeBot;
  let mocks: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = createMockDependencies();
    bot = new TradeBot({ ...baseBotConfig, wallet: mocks.wallet }, mocks.socket);
    Object.defineProperties(bot, {
      notificationService: { value: mocks.notificationService, writable: true },
      configService: { value: mocks.configService, writable: true },
      nextTrade: {
        value: { inputMint: 'input-token', outputMint: 'output-token', amount: 1000, swapMode: 'ExactIn' },
        writable: true,
      },
    });
  });

  describe('updateNextTrade', () => {
    it('updates next trade with correct amounts and target price', async () => {
      await bot['updateNextTrade']({ ...baseQuote });
      expect(bot['nextTrade']).toEqual({
        inputMint: 'output-token',
        outputMint: 'input-token',
        amount: 1010000,
        swapMode: 'ExactIn',
      });
      expect(bot['firstTradePrice']).toBe(1010000);
    });

    it('reverses trade direction when target gain is reached', async () => {
      const highGainQuote = { ...baseQuote, outAmount: '1020000' };
      const terminateSpy = jest.spyOn(bot, 'terminateSession');
      await bot['updateNextTrade'](highGainQuote);
      expect(terminateSpy).not.toHaveBeenCalled();
      expect(bot['nextTrade']).toEqual({
        inputMint: 'output-token',
        outputMint: 'input-token',
        amount: 1020000,
        swapMode: 'ExactIn',
      });
      expect(bot['firstTradePrice']).toBe(1010000);
    });

    it('throws error for invalid target gain percentage', async () => {
      bot['targetGainPercentage'] = 0;
      await expect(bot['updateNextTrade']({ ...baseQuote })).rejects.toThrow('Invalid target gain percentage');
    });
  });
});