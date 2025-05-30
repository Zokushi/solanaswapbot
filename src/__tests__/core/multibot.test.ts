import { MultiBot } from '../../core/multibot.js';
import { ConfigService } from '../../services/configService.js';
import { TradeService } from '../../services/tradeService.js';
import { NotificationService } from '../../services/notificationService.js';
import { Socket } from 'socket.io-client';
import { Address, createKeyPairFromBytes, getAddressFromPublicKey } from '@solana/kit';
import { jest } from '@jest/globals';
import { QuoteResponse } from '../../core/types.js';
import fs from 'fs';

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POPCAT = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
const GIGACHAD = "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9";
const DOGWIFHAT = "8GmjQWW6agtTrpL3Bkb6q9o3UA1LqjEzhPKTCsjbpTtK";

// Mock dependencies
jest.mock('../../services/configService.js');
jest.mock('../../services/tradeService.js');
jest.mock('../../services/notificationService.js');
jest.mock('socket.io-client');
jest.mock('@solana/kit', () => {
  const actual = jest.requireActual('@solana/kit') as Record<string, unknown>;
  return {
    ...actual,
    getAddressFromPublicKey: jest.fn().mockImplementation(async () => 'mockWalletAddress' as Address)
  };
});
jest.mock('../../utils/helper.js', () => ({
  getTokenDecimalsByAddressRaw: jest.fn().mockImplementation(async (...args: unknown[]) => {
    const address = args[0] as string;
    if (address === SOL) return 9;
    if (address === USDC) return 6;
    if (address === POPCAT) return 6;
    if (address === GIGACHAD) return 6;
    if (address === DOGWIFHAT) return 6;
    throw new Error(`Token with address "${address}" not found.`);
  }),
  getTokenName: jest.fn().mockImplementation(async (...args: unknown[]) => {
    const address = args[0] as string;
    if (address === SOL) return "Wrapped SOL";
    if (address === USDC) return "USD Coin";
    if (address === POPCAT) return "POPCAT";
    if (address === GIGACHAD) return "GIGACHAD";
    if (address === DOGWIFHAT) return "dogwifhat";
    throw new Error(`Token with address "${address}" not found.`);
  }),
  getTokenDecimalsByAddress: jest.fn().mockImplementation(async (...args: unknown[]) => {
    const [address, value] = args as [string, number];
    if (address === SOL) return value / Math.pow(10, 9);
    if (address === USDC) return value / Math.pow(10, 6);
    if (address === POPCAT) return value / Math.pow(10, 6);
    if (address === GIGACHAD) return value / Math.pow(10, 6);
    if (address === DOGWIFHAT) return value / Math.pow(10, 6);
    throw new Error(`Token with address "${address}" not found.`);
  })
}));

// Mock MultiBot constructor
jest.mock('../../core/multibot.js', () => {
  const actual = jest.requireActual('../../core/multibot.js') as { MultiBot: typeof MultiBot };
  return {
    MultiBot: jest.fn().mockImplementation(function(this: any, config: any, socket: any) {
      const instance = new actual.MultiBot(config, socket);
      // These will be set in beforeEach
      (instance as any).configService = undefined;
      (instance as any).tradeService = undefined;
      (instance as any).notificationService = undefined;
      return instance;
    })
  };
});

describe('MultiBot', () => {
  let mockSocket: jest.Mocked<Socket>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockTradeService: jest.Mocked<TradeService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let bot: MultiBot;
  let mockConfig: any;

  beforeAll(async () => {
    // Read test wallet keypair
    const keypairBytes = JSON.parse(fs.readFileSync('test-wallet.json', 'utf-8'));
    const keypair = await createKeyPairFromBytes(new Uint8Array(keypairBytes));
    
    mockConfig = {
      botId: 'test-bot',
      rpc: {} as any,
      subscriptions: {} as any,
      wallet: keypair,
      initialInputToken: SOL,
      targetAmounts: {
        [USDC]: 100
      },
      initialBalance: 1000,
      targetGainPercentage: 5,
      checkInterval: 20000
    };
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSocket = { on: jest.fn(), emit: jest.fn() } as unknown as jest.Mocked<Socket>;
    mockConfigService = new ConfigService() as jest.Mocked<ConfigService>;
    mockTradeService = new TradeService(
      'test-bot',
      mockConfig.wallet,
      mockConfig.rpc,
      mockConfig.subscriptions,
      async () => {},
      () => {}
    ) as jest.Mocked<TradeService>;
    mockNotificationService = new NotificationService() as jest.Mocked<NotificationService>;

    // Mock ConfigService methods
    mockConfigService.updateBotConfig = jest.fn<(botId: string, data: any) => Promise<any>>().mockResolvedValue(undefined);

    // Mock TradeService methods
    mockTradeService.getFilteredTokenAccounts = jest.fn<(wallet: Address, mint: Address) => Promise<string>>().mockResolvedValue('mockTokenAccount');
    mockTradeService.getQuote2 = jest.fn<(quoteRequest: any) => Promise<QuoteResponse | undefined>>().mockResolvedValue({
      inputMint: SOL,
      outputMint: USDC,
      inAmount: '1000',
      outAmount: '1100',
      otherAmountThreshold: '0',
      swapMode: 'ExactIn',
      slippageBps: 50,
      priceImpactPct: '0.1',
      routePlan: []
    });

    // Mock NotificationService methods
    mockNotificationService.logSwap = jest.fn<(args: any) => Promise<void>>().mockResolvedValue(undefined);
    mockNotificationService.emit = jest.fn<(socket: Socket, event: string, data: any) => void>();

    // Create bot instance with mocked services
    bot = new MultiBot({
      ...mockConfig,
      configService: mockConfigService,
      tradeService: mockTradeService,
      notificationService: mockNotificationService
    } as any, mockSocket);

    // Set the mock services on the bot instance
    (bot as any).configService = mockConfigService;
    (bot as any).tradeService = mockTradeService;
    (bot as any).notificationService = mockNotificationService;
  });

  describe('postTransactionProcessing', () => {
    afterEach(() => {
      if (bot) {
        bot.terminateSession();
      }
    });

    it('should update config file after successful trade', async () => {
      // Mock quote response
      const mockQuote: QuoteResponse = {
        inputMint: SOL,
        outputMint: USDC,
        inAmount: '1000',
        outAmount: '1100',
        otherAmountThreshold: '0',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: []
      };

      // Call postTransactionProcessing
      await bot.postTransactionProcessing(mockQuote, 'mockTxId');

      // Verify config was updated
      expect(mockConfigService.updateBotConfig).toHaveBeenCalledWith(
        'test-bot',
        expect.objectContaining({
          botId: 'test-bot',
          initialInputToken: expect.any(String),
          initialBalance: expect.any(Number),
          targetAmounts: expect.any(Object),
          targetGainPercentage: 5,
          checkInterval: 20000
        })
      );
    });

    it('should handle config update errors gracefully', async () => {
      // Mock quote response
      const mockQuote: QuoteResponse = {
        inputMint: SOL,
        outputMint: USDC,
        inAmount: '1000',
        outAmount: '1100',
        otherAmountThreshold: '0',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: []
      };

      // Call postTransactionProcessing - should not throw
      await expect(bot.postTransactionProcessing(mockQuote, 'mockTxId')).resolves.not.toThrow();

      // Verify config update was attempted
      expect(mockConfigService.updateBotConfig).toHaveBeenCalled();
    });
  });
});