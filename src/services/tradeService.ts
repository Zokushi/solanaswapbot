import { QuoteGetRequest, QuoteResponse } from "../core/types.js";
import { TradeBotError, ErrorCodes, logError } from "../utils/error.js";
import {
  getAddressFromPublicKey,
  getTransactionDecoder,
  signTransaction,
  assertTransactionIsFullySigned,
  getSignatureFromTransaction,
  SolanaRpcSubscriptionsApi,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  Rpc,
  Address,
  SolanaRpcApiMainnet,
  Signature,
  address,
} from "@solana/kit";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import logger from "../utils/logger.js";
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 300 }); // 5-minute TTL
dotenv.config();

const replacer = (key: string, value: any) => (typeof value === "bigint" ? value.toString() : value);

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
      throw new TradeBotError('RPC client is undefined', ErrorCodes.INVALID_CONFIG, { botId: botId.toString() });
    }
    if (!subscriptions) {
      throw new TradeBotError('Subscriptions client is undefined', ErrorCodes.INVALID_CONFIG, { botId: botId.toString() });
    }

    if (!wallet.publicKey) {
      throw new TradeBotError('Wallet public key is undefined', ErrorCodes.WALLET_ERROR, { botId: botId.toString() });
    }
  }

  async getFilteredTokenAccounts(wallet: Address, mint: Address): Promise<string> {
    const cacheKey = `${wallet}:${mint}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      logger.info(`[TradeService] Returning cached token account: ${cached}`);
      return cached;
    }
    logger.warn(`[TradeService] Fetching filtered token accounts for wallet: ${wallet}, mint: ${mint}`);
    try {
      const response = await this.rpc.getTokenAccountsByOwner(address(wallet), { mint: mint }, { encoding: "jsonParsed" }).send();
      const accountData = response.value[0]?.account?.data?.parsed?.info;
      const uiAmountString = accountData?.tokenAmount?.uiAmountString;
      logger.warn(`[TradeService] Available balance: ${uiAmountString}`);
      if (!response.value || response.value.length === 0) {
        throw new TradeBotError(`No token account found for mint ${mint}`, ErrorCodes.TOKEN_ACCOUNT_ERROR, { mint });
      }

      const tokenAccount = response.value[0].pubkey;
      if (!tokenAccount || typeof tokenAccount !== 'string') {
        throw new TradeBotError(`Invalid token account public key`, ErrorCodes.TOKEN_ACCOUNT_ERROR, { mint, pubkey: tokenAccount });
      }

      logger.warn(`[TradeService] Selected token account: ${tokenAccount}`);
      cache.set(cacheKey, tokenAccount);
      return tokenAccount;
    } catch (err) {
      const error = logError(err, 'TradeService');
      throw error;
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

  async getSwap(quoteResponse: QuoteResponse, userPublicKey: Address, feeAccount?: Address): Promise<any> {
    logger.warn(`[TradeService] Initiating swap with quote: ${JSON.stringify(quoteResponse, replacer)}`);
    try {
      const swapResponse = await (
        await fetch(`${this.baseUrl}/swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey,
            feeAccount,
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
          ErrorCodes.QUOTE_FETCH_ERROR,
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
        throw new TradeBotError('Invalid quote response: Missing outAmount', ErrorCodes.QUOTE_FETCH_ERROR, { response: quote });
      }

      return quote;
    } catch (err) {
      const error = err instanceof TradeBotError ? err : new TradeBotError(
        `Failed to fetch quote: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCodes.QUOTE_FETCH_ERROR,
        { quoteRequest }
      );
      logger.error(`[TradeService] ${error.message}`, error);
      throw error;
    }
  }

  public async evaluateQuoteAndSwap(quote: QuoteResponse, thresholdPrice: number, forceSwap: boolean = false): Promise<boolean> {
    if (!quote || !quote.outAmount) {
      throw new TradeBotError('Invalid quote response: Missing outAmount', ErrorCodes.QUOTE_FETCH_ERROR, { response: quote });
    }

    const currentPrice = parseInt(quote.outAmount);

    if (forceSwap || currentPrice >= thresholdPrice) {
      try {
        this.setwaitingForConfirmation(true);
        await this.executeSwap(quote);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to execute swap';
        logger.error(`[TradeService] ${errorMsg}`);
        return false;
      }
    }
    return false;
  }

  private async executeSwap(route: QuoteResponse): Promise<void> {
    const abortController = new AbortController();
    try {
      logger.warn(`📡 [TradeService] Starting swap execution...`);

      const pubKey = await getAddressFromPublicKey(this.wallet.publicKey);
      if (!pubKey) {
        throw new TradeBotError('Error fetching public key', ErrorCodes.WALLET_ERROR);
      }

      const feeAccount = await this.ata(route);

      const tx = await this.getSwap(route, pubKey, feeAccount as Address);
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
    } catch (err) {
      const error = err instanceof TradeBotError ? err : new TradeBotError(
        err instanceof Error && err.name === "AbortError"
          ? `Transaction timed out: ${err.message}`
          : `Swap execution failed: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCodes.SWAP_EXECUTION_ERROR,
        { route }
      );
      logger.error(`❌ [TradeService] ${error.message}`, error);
      this.setwaitingForConfirmation(false);
      throw error;
    }
  }
}