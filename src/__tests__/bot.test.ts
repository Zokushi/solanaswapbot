import { TradeBot } from '../core/bot.js';
import { QuoteResponse, NextTrade } from '../core/types.js';
import { NotificationService } from '../services/notificationService.js';
import { ConfigService } from '../services/configService.js';
import { Socket } from 'socket.io-client';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../services/notificationService.js');
jest.mock('../services/configService.js');
jest.mock('socket.io-client');

describe('TradeBot', () => {
  let bot: TradeBot;
  let mockSocket: jest.Mocked<Socket>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock socket
    mockSocket = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as jest.Mocked<Socket>;

    // Create mock notification service
    mockNotificationService = {
      log: jest.fn(),
      emit: jest.fn(),
      logSwap: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    // Create mock config service
    mockConfigService = {
      updateBotConfig: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    // Create mock wallet
    const mockWallet = {
      publicKey: {
        algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
        extractable: true,
        type: 'public',
        usages: ['verify'],
      },
      privateKey: {
        algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
        extractable: true,
        type: 'private',
        usages: ['sign'],
      },
    } as CryptoKeyPair;

    // Create bot instance with mock dependencies
    bot = new TradeBot({
      botId: 'test-bot',
      wallet: mockWallet,
      rpc: {} as any,
      subscriptions: {} as any,
      firstTradePrice: 1000,
      targetGainPercentage: 1,
      initialInputToken: 'input-token',
      initialInputAmount: 1000,
      initialOutputToken: 'output-token',
    }, mockSocket);

    // Initialize nextTrade property
    Object.defineProperty(bot, 'nextTrade', {
      value: {
        inputMint: 'input-token',
        outputMint: 'output-token',
        amount: 1000,
        swapMode: 'ExactIn',
      },
      writable: true,
    });

    // Replace services with mocks using Object.defineProperty
    Object.defineProperty(bot, 'notificationService', {
      value: mockNotificationService,
      writable: true,
    });
    Object.defineProperty(bot, 'configService', {
      value: mockConfigService,
      writable: true,
    });
  });

  describe('updateNextTrade', () => {
    it('should update next trade with correct amounts and target price', async () => {
      // Setup target gain percentage
      bot['targetGainPercentage'] = 1; // 1% target gain

      // Create mock quote response
      const mockQuote: QuoteResponse = {
        inputMint: 'input-token',
        inAmount: '1000000', // 1000 with 3 decimals
        outputMint: 'output-token',
        outAmount: '1010000', // 1010 with 3 decimals
        otherAmountThreshold: '0',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: [],
      };

      // Call updateNextTrade
      await bot['updateNextTrade'](mockQuote);

      // Verify next trade was updated correctly
      const expectedNextTrade = {
        inputMint: 'output-token',  // Should be swapped
        outputMint: 'input-token',  // Should be swapped
        amount: 1010000,           // Should be the output amount from the quote
        swapMode: 'ExactIn',
      };

      expect(bot['nextTrade']).toEqual(expectedNextTrade);

      // Verify firstTradePrice was updated
      // Expected: 1000000 (input) + 10000 (1% of input) = 1010000
      expect(bot['firstTradePrice']).toBe(1010000);

      // Additional verification of the trade reversal
      expect(bot['nextTrade'].inputMint).toBe(mockQuote.outputMint);
      expect(bot['nextTrade'].outputMint).toBe(mockQuote.inputMint);
      expect(bot['nextTrade'].amount).toBe(Number(mockQuote.outAmount));
    });

    it('should reverse trade direction when target gain is reached', async () => {
      // Setup initial state
      bot['targetGainPercentage'] = 1; // 1% target gain

      // Create mock quote response with gain exceeding target
      const mockQuote: QuoteResponse = {
        inputMint: 'input-token',
        inAmount: '1000000', // 1000 with 3 decimals
        outputMint: 'output-token',
        outAmount: '1020000', // 1020 with 3 decimals (2% gain)
        otherAmountThreshold: '0',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: [],
      };

      // Spy on terminateSession to ensure it's NOT called
      const terminateSpy = jest.spyOn(bot, 'terminateSession');

      // Call updateNextTrade
      await bot['updateNextTrade'](mockQuote);

      // Verify bot did NOT terminate
      expect(terminateSpy).not.toHaveBeenCalled();

      // Verify trade direction was reversed
      expect(bot['nextTrade']).toEqual({
        inputMint: 'output-token',
        outputMint: 'input-token',
        amount: 1020000,
        swapMode: 'ExactIn',
      });

      // Verify target price was updated
      expect(bot['firstTradePrice']).toBe(1010000); // 1000000 + 1% = 1010000
    });

    it('should throw error for invalid target gain percentage', async () => {
      // Setup initial state with invalid target gain
      bot['targetGainPercentage'] = 0;

      const mockQuote: QuoteResponse = {
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

      // Verify error is thrown
      await expect(bot['updateNextTrade'](mockQuote)).rejects.toThrow(
        'Invalid target gain percentage'
      );
    });
  });
}); 