import { QuoteGetRequest, QuoteResponse } from "../core/types.js";
import { ErrorCodes, TradeBotError } from "../utils/errors.js";
import { handleError } from "../utils/errorHandler.js";
import { getAddressFromPublicKey, getTransactionDecoder, signTransaction, assertTransactionIsFullySigned, getSignatureFromTransaction, SolanaRpcSubscriptionsApi, RpcSubscriptions, sendAndConfirmTransactionFactory, Rpc, Address, SolanaRpcApiMainnet, Signature, address } from "@solana/kit";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { createLogger } from "../utils/logger.js";
import NodeCache from 'node-cache';
import { replacer } from "../utils/replacer.js";

dotenv.config();

const logger = createLogger('TradeService');
const cache = new NodeCache({ stdTTL: 300 }); // 5-minute TTL


export class TradeService {
  private readonly baseUrl: string = "https://lite-api.jup.ag/swap/v1";

  constructor(
    private botId: string,
    private readonly wallet: CryptoKeyPair,
    private readonly rpc: Rpc<SolanaRpcApiMainnet>,
    private readonly subscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    public postTransactionProcessing: (route: QuoteResponse, signature: string) => Promise<void>,
    public setwaitingForConfirmation: (flag: boolean) => void
  ) {
    if (!rpc) {
      handleError(null, 'RPC client is undefined', ErrorCodes.INVALID_CONFIG.code, { botId });
    }
    if (!subscriptions) {
      handleError(null, 'Subscriptions client is undefined', ErrorCodes.INVALID_CONFIG.code, { botId });
    }
    if (!wallet.publicKey) {
      handleError(null, 'Wallet public key is undefined', ErrorCodes.WALLET_ERROR.code, { botId });
    }
  }

  async getFilteredTokenAccounts(wallet: Address, mint: Address): Promise<string> {
    const cacheKey = `${wallet}:${mint}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      logger.info(`[TradeService] Returning cached token account: ${cached}`);
      return cached;
    }
    logger.info(`[TradeService] Fetching filtered token accounts for wallet: ${wallet}, mint: ${mint}`);
    try {
      const response = await this.rpc.getTokenAccountsByOwner(address(wallet), { mint: mint }, { encoding: "jsonParsed" }).send();
      const accountData = response.value[0]?.account?.data?.parsed?.info;
      const uiAmountString = accountData?.tokenAmount?.uiAmountString;
      logger.warn(`[TradeService] Available balance: ${uiAmountString}`);
      if (!response.value || response.value.length === 0) {
        throw new TradeBotError(`No token account found for mint ${mint}`, ErrorCodes.TOKEN_ACCOUNT_ERROR.code, { mint });
      }

      const tokenAccount = response.value[0].pubkey;
      if (!tokenAccount || typeof tokenAccount !== 'string') {
        throw new TradeBotError(`Invalid token account public key`, ErrorCodes.TOKEN_ACCOUNT_ERROR.code, { mint, pubkey: tokenAccount });
      }

      logger.warn(`[TradeService] Selected token account: ${tokenAccount}`);
      cache.set(cacheKey, tokenAccount);
      return tokenAccount;
    } catch (error) {
      handleError(error, `Error fetching token accounts for wallet ${wallet} and mint ${mint}`, ErrorCodes.TOKEN_ACCOUNT_ERROR.code, { wallet, mint });
    }
  }
  async getTokenAccountBalance(mint: string): Promise<string> {
    if (!this.wallet || !this.wallet.publicKey) {
      throw new Error("Wallet is not initialized or public key is missing");
    }
    try {
      const publicKeyString = await getAddressFromPublicKey(this.wallet.publicKey);
      const wallet = publicKeyString;

      const tokenAccount = await this.rpc
        .getTokenAccountsByOwner(wallet, { mint: mint as Address }, { encoding: "jsonParsed" })
        .send();
      if (!tokenAccount.value || tokenAccount.value.length === 0) {
        throw new Error(`No token account found for mint ${mint}`);
      }

      const balance = await this.rpc.getTokenAccountBalance(tokenAccount.value[0].pubkey).send();
      return balance.value.uiAmountString || "0";
    } catch (err) {
      logger.error(`[TradeService] Error fetching token balance: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  async signatureSub(signature: Signature): Promise<void> {
    try {
      logger.warn(`[TradeService] Subscribing to signature: ${signature}`);
      this.subscriptions.signatureNotifications(signature, { enableReceivedNotification: true });
    } catch (err) {
      logger.error(`[TradeService] Error subscribing to signature: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  async getSwap(quoteResponse: QuoteResponse, userPublicKey: Address, account?: Address): Promise<any> {
    logger.warn(`[TradeService] Initiating swap with quote: ${JSON.stringify(quoteResponse, replacer)}`);
    try {
      const swapResponse = await (
        await fetch(`${this.baseUrl}/swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey,
            feeAccount: account,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            prioritizationFeeLamports: {
              priorityLevelWithMaxLamports: {
                maxLamports: 1_000_000,
                priorityLevel: "veryHigh",
              },
            },
          }),
        })
      ).json();
      logger.warn(`[TradeService] Swap response: ${JSON.stringify(swapResponse, replacer)}`);
      return swapResponse;
    } catch (err) {
      logger.error(`[TradeService] Error executing swap: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  public async ata(quoteRequest: QuoteResponse): Promise<string> {
    try {
      const pubWallet = "8sZ5yWf1TPk86ehw7ekPMcrXr76YXgMnLwWe8ZLRjDqz"
      logger.warn(`🔍 [TradeService] Checking ATA for mint: ${quoteRequest.outputMint}`);

      const ata = await getAssociatedTokenAddress(
        new PublicKey(quoteRequest.outputMint),
        new PublicKey(pubWallet),
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      logger.warn(`✅ [TradeService] ATA: ${ata.toBase58()}`);
      return ata.toBase58();
    } catch (err) {
      logger.error(`[TradeService] Error fetching ATA: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  public async getQuote2(quoteRequest: QuoteGetRequest): Promise<QuoteResponse | undefined> {
    try {
      if (!quoteRequest.inputMint || !quoteRequest.outputMint || !quoteRequest.amount) {
        throw new Error("Missing required fields: inputMint, outputMint, or amount");
      }

      const url = new URL(`${this.baseUrl}/quote`);
      url.searchParams.append("inputMint", quoteRequest.inputMint);
      url.searchParams.append("outputMint", quoteRequest.outputMint);
      url.searchParams.append("amount", quoteRequest.amount.toString());
      url.searchParams.append("autoSlippage", (quoteRequest.autoSlippage ?? true).toString());
      url.searchParams.append("maxAutoSlippageBps", (quoteRequest.maxAutoSlippageBps ?? 50).toString());
      url.searchParams.append("platformFeeBps", (quoteRequest.platformFeeBps ?? 10).toString());

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new TradeBotError(
          `HTTP error fetching quote: ${response.status} ${response.statusText} - ${errorText}`,
          ErrorCodes.QUOTE_FETCH_ERROR.code,
          {
            status: response.status,
            statusText: response.statusText,
            url: url.toString(),
            errorText
          }
        );
      }

      const quote = await response.json() as QuoteResponse;
      if (!quote || !quote.outAmount) {
        throw new TradeBotError('Invalid quote response: Missing outAmount', ErrorCodes.QUOTE_FETCH_ERROR.code, { response: quote });
      }

      return quote;
    } catch (err) {
      const error = err instanceof TradeBotError ? err : new TradeBotError(
        `Failed to fetch quote: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCodes.QUOTE_FETCH_ERROR.code,
        { quoteRequest }
      );
      logger.error(`[TradeService] ${error.message}`, error);
      throw error;
    }
  }

  public async evaluateQuoteAndSwap(
    quote: QuoteResponse, 
    thresholdPrice: number, 
    stopLossPercentage?: number,
    trailingStopLossPercentage?: number,
    highestPrice?: number,
  ): Promise<{ swapped?: boolean; terminate?: boolean }> {
    if (!quote || !quote.outAmount) {
      throw new TradeBotError('Invalid quote response: Missing outAmount', ErrorCodes.QUOTE_FETCH_ERROR.code, { response: quote });
    }

    const currentPrice = parseInt(quote.outAmount);
    const priceDiff = ((currentPrice - thresholdPrice) / thresholdPrice) * 100;

    // Check regular stop loss
    if (stopLossPercentage) {
    if (priceDiff < -stopLossPercentage) {
      logger.info(`[TradeService] Stop loss triggered at ${currentPrice} (${priceDiff}% below threshold)`);
      try {
        this.setwaitingForConfirmation(true);
        const stopLoss = await this.executeSwap(quote);
        if (stopLoss) {
          return {swapped: true, terminate: true}
        }
      } catch (err) {
        handleError(err, 'Failed to execute stop loss swap', ErrorCodes.SWAP_EXECUTION_ERROR.code, { quote });
      }
    }
  }
    // Check trailing stop loss
    if (trailingStopLossPercentage && highestPrice) {
      const trailingStopLevel = highestPrice * (1 - trailingStopLossPercentage / 100);
      if (currentPrice < trailingStopLevel) {
        logger.info(`[TradeService] Trailing stop loss triggered at ${currentPrice} (below trailing stop level ${trailingStopLevel})`);
        try {
          this.setwaitingForConfirmation(true);
          const trailingLoss = await this.executeSwap(quote);
          if (trailingLoss) {
            return {swapped: true, terminate: true}
          }
        } catch (err) {
          handleError(err, 'Failed to execute trailing stop loss swap', ErrorCodes.SWAP_EXECUTION_ERROR.code, { quote });
        }
      }
    }

    // Check target gain
    if (currentPrice >= thresholdPrice) {
      try {
        logger.info(`[TradeService] Target gain triggered. Setting Confirmation to True)`);
        this.setwaitingForConfirmation(true);
        logger.info(`[TradeService] Executing swap...`);
        const profit = await this.executeSwap(quote);
        logger.info(`[TradeService] Swap executed. Result: ${profit}`);
        if(profit) {
          return {swapped: true, terminate: false}
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to execute swap';
        logger.error(`[TradeService] ${errorMsg}`);
        return {swapped: false, terminate: false}
      }
    }
    return {swapped: false, terminate: false}
  }

  public async executeSwap(route: QuoteResponse): Promise<boolean> {
    const abortController = new AbortController();
    try {
      logger.warn(`📡 [TradeService] Starting swap execution...`);

      const pubKey = await getAddressFromPublicKey(this.wallet.publicKey);
      if (!pubKey) {
        throw new TradeBotError('Error fetching public key', ErrorCodes.WALLET_ERROR.code);
      }

      const account = await this.ata(route);

      const tx = await this.getSwap(route, pubKey, account as Address);
      const swapTransactionBuf = Buffer.from(tx.swapTransaction, "base64");
      if (!Buffer.isBuffer(swapTransactionBuf)) throw new Error("Invalid transaction buffer");

      const transactionDecoder = getTransactionDecoder();
      const swapTransaction = transactionDecoder.decode(swapTransactionBuf);
      const signedTransaction = await signTransaction([this.wallet], swapTransaction);
      assertTransactionIsFullySigned(signedTransaction);

      const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
        rpc: this.rpc,
        rpcSubscriptions: this.subscriptions,
      });
      const latestBlockhash = await this.rpc.getLatestBlockhash().send();
      const signedTransactionWithLifetime = {
        ...signedTransaction,
        lifetimeConstraint: {
          blockhash: latestBlockhash.value.blockhash,
          lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
        },
      };

      const signature = getSignatureFromTransaction(signedTransactionWithLifetime);
      logger.warn(`📜 [TradeService] Transaction signature: ${signature}`);

      await sendAndConfirmTransaction(signedTransactionWithLifetime, {
        commitment: "confirmed",
        abortSignal: abortController.signal,
        maxRetries: BigInt(3),
      });

      logger.warn(`✅ [TradeService] Transaction confirmed: ${signature}`);
      await this.postTransactionProcessing(route, signature);
      logger.warn(`✅ [TradeService] Post-transaction processing completed`);

      this.setwaitingForConfirmation(false);
      return true;
    } catch (err) {
      const error = err instanceof TradeBotError ? err : new TradeBotError(
        err instanceof Error && err.name === "AbortError"
          ? `Transaction timed out: ${err.message}`
          : `Swap execution failed: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCodes.SWAP_EXECUTION_ERROR.code,
        { route }
      );
      logger.error(`❌ [TradeService] ${error.message}`, error);
      this.setwaitingForConfirmation(false);
      throw error;
    }
  }
}