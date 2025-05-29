// __tests__/services/tradeService.test.ts
import { TradeService } from '../../services/tradeService.js';
import { QuoteResponse, QuoteGetRequest } from '../../core/types.js';
import { Rpc, Address, SolanaRpcApiMainnet } from '@solana/kit';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { jest } from '@jest/globals';
import fetch from 'node-fetch';
import { TradeBotError, ErrorCodes } from '../../utils/error.js';
import logger from '../../utils/logger.js';

// Mock dependencies
jest.mock('node-fetch');
jest.mock('@solana/kit');
jest.mock('../../utils/logger');
jest.mock('../../utils/error', () => ({
  TradeBotError: jest.fn().mockImplementation((message, code, data) => ({
    message,
    code,
    data,
  })),
  ErrorCodes: {
    TOKEN_ACCOUNT_ERROR: 'TOKEN_ACCOUNT_ERROR',
    QUOTE_FETCH_ERROR: 'QUOTE_FETCH_ERROR',
  },
}));
describe('TradeService', () => {
  let tradeService: TradeService;
  let mockRpc: jest.Mocked<Rpc<SolanaRpcApiMainnet>>;
  let mockSubscriptions: any;
  let mockWallet: CryptoKeyPair;
  let mockPostTransactionProcessing: jest.Mock<Promise<void>, [QuoteResponse, string]>;
  let mockSetWaitingForConfirmation: jest.Mock<void, [boolean]>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc = {
      getTokenAccountsByOwner: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          context: { slot: BigInt(123) },
          value: [{
            pubkey: 'mockTokenAccount' as Address,
            account: {
              data: {
                parsed: {
                  info: {
                    tokenAmount: { uiAmountString: '100', amount: '1000000000', decimals: 9, uiAmount: 100 },
                    mint: 'mintAddress' as Address,
                    owner: 'walletAddress' as Address,
                    state: 'initialized',
                  },
                },
                program: 'spl-token',
                space: 165,
              },
              executable: false,
              lamports: BigInt(2039280),
              owner: TOKEN_PROGRAM_ID,
              rentEpoch: BigInt(123),
            },
          }],
        } as GetTokenAccountsByOwnerResponse<Readonly<{ data: any }>>),
      }),
      getTokenAccountBalance: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          context: { slot: BigInt(123) },
          value: { amount: '1000000000', decimals: 9, uiAmount: 100, uiAmountString: '100' },
        } as GetTokenAccountBalanceResponse),
      }),
      getLatestBlockhash: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          context: { slot: BigInt(123) },
          value: { blockhash: 'mockBlockhash', lastValidBlockHeight: BigInt(1000) },
        } as GetLatestBlockhashResponse),
      }),
    } as any;

    mockSubscriptions = {
      signatureNotifications: jest.fn(),
    };

    mockWallet = {
      publicKey: {
        algorithm: { name: 'ECDSA' } as EcKeyAlgorithm,
        extractable: true,
        type: 'public',
        usages: ['verify'],
      } as CryptoKey,
      privateKey: {
        algorithm: { name: 'ECDSA' } as EcKeyAlgorithm,
        extractable: true,
        type: 'private',
        usages: ['sign'],
      } as CryptoKey,
    } as CryptoKeyPair;

    mockPostTransactionProcessing = jest.fn<Promise<void>, [QuoteResponse, string]>().mockResolvedValue(undefined);
    mockSetWaitingForConfirmation = jest.fn();

    tradeService = new TradeService(
      'test-bot',
      mockWallet,
      mockRpc,
      mockSubscriptions,
      mockPostTransactionProcessing,
      mockSetWaitingForConfirmation
    );
  });

  describe('getFilteredTokenAccounts', () => {
    it('should return cached token account if available', async () => {
      const mockCache = {
        get: jest.fn().mockReturnValue('cachedTokenAccount'),
        set: jest.fn(),
      };
      jest.spyOn(require('node-cache'), 'NodeCache').mockImplementation(() => mockCache);

      const result = await tradeService.getFilteredTokenAccounts('walletAddress' as Address, 'mintAddress' as Address);
      expect(result).toBe('cachedTokenAccount');
      expect(mockCache.get).toHaveBeenCalledWith('walletAddress:mintAddress');
    });

    it('should fetch and cache token account if not cached', async () => {
      const mockCache = {
        get: jest.fn().mockReturnValue(undefined),
        set: jest.fn(),
      };
      jest.spyOn(require('node-cache'), 'NodeCache').mockImplementation(() => mockCache);

      const result = await tradeService.getFilteredTokenAccounts('walletAddress' as Address, 'mintAddress' as Address);
      expect(result).toBe('mockTokenAccount');
      expect(mockRpc.getTokenAccountsByOwner).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith('walletAddress:mintAddress', 'mockTokenAccount');
    });

    it('should throw TradeBotError if no token account is found', async () => {
      mockRpc.getTokenAccountsByOwner.mockReturnValue({
        send: jest.fn().mockResolvedValue({ context: { slot: BigInt(123) }, value: [] }),
      });

      await expect(tradeService.getFilteredTokenAccounts('walletAddress' as Address, 'mintAddress' as Address)).rejects.toThrow(
        new TradeBotError('No token account found for mint mintAddress', ErrorCodes.TOKEN_ACCOUNT_ERROR, { mint: 'mintAddress' })
      );
    });
  });

  describe('getQuote2', () => {
    it('should fetch and return a valid quote', async () => {
      const mockQuote: QuoteResponse = {
        inputMint: 'inputMint',
        outputMint: 'outputMint',
        inAmount: '1000',
        outAmount: '1100',
        otherAmountThreshold: '0',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: [],
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockQuote),
        status: 200,
        statusText: 'OK',
      });

      const quoteRequest: QuoteGetRequest = {
        inputMint: 'inputMint',
        outputMint: 'outputMint',
        amount: 1000,
        autoSlippage: true,
        maxAutoSlippageBps: 50,
        platformFeeBps: 10,
      };

      const result = await tradeService.getQuote2(quoteRequest);
      expect(result).toEqual(mockQuote);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://lite-api.jup.ag/swap/v1/quote?inputMint=inputMint&outputMint=outputMint&amount=1000'),
        expect.any(Object)
      );
    });

    it('should throw TradeBotError for invalid quote response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
        status: 200,
        statusText: 'OK',
      });

      const quoteRequest: QuoteGetRequest = {
        inputMint: 'inputMint',
        outputMint: 'outputMint',
        amount: 1000,
      };

      await expect(tradeService.getQuote2(quoteRequest)).rejects.toThrow(
        new TradeBotError('Invalid quote response: Missing outAmount', ErrorCodes.QUOTE_FETCH_ERROR, expect.any(Object))
      );
    });
  });
});