import { createRpc, createSolanaRpcApi, createDefaultRpcTransport, createSolanaRpcSubscriptions, mainnet, ClusterUrl, SolanaRpcApiMainnet, Rpc} from "@solana/kit";
import  { createLogger } from "../utils/logger.js";
import { RpcClients } from "../core/types.js";
import { replacer } from "../utils/replacer.js";

const logger = createLogger("RpcFactory");

export async function createRpcClients(config: { solanaEndpoint: string; wssEndpoint: ClusterUrl }): Promise<RpcClients> {
  logger.info(`[RpcFactory] Creating RPC clients with solanaEndpoint: ${config.solanaEndpoint}, wssEndpoint: ${config.wssEndpoint}`);

  if (!config.solanaEndpoint || !config.solanaEndpoint.startsWith("http")) {
    logger.error(`[RpcFactory] Invalid solanaEndpoint: ${config.solanaEndpoint}`);
    throw new Error("Invalid solanaEndpoint: must be an HTTP/HTTPS URL");
  }
  if (!config.wssEndpoint || !config.wssEndpoint.startsWith("ws")) {
    logger.error(`[RpcFactory] Invalid wssEndpoint: ${config.wssEndpoint}`);
    throw new Error("Invalid wssEndpoint: must be a WebSocket URL");
  }

  try {
    logger.info("[RpcFactory] Creating RPC API...");
    const rpcApi = createSolanaRpcApi<SolanaRpcApiMainnet>({ defaultCommitment: "confirmed" });
    if (!rpcApi) {
      logger.error("[RpcFactory] Failed to create RPC API");
      throw new Error("Failed to create RPC API");
    }
    logger.info("[RpcFactory] RPC API created successfully");

    logger.info("[RpcFactory] Creating JSON-RPC transport...");
    const jsonRpcTransport = createDefaultRpcTransport({ url: config.solanaEndpoint });
    if (!jsonRpcTransport) {
      logger.error("[RpcFactory] Failed to create JSON-RPC transport");
      throw new Error("Failed to create JSON-RPC transport");
    }
    logger.info("[RpcFactory] JSON-RPC transport created successfully");

    logger.info("[RpcFactory] Creating RPC client...");
    const rpc = createRpc({ api: rpcApi, transport: jsonRpcTransport });
    if (!rpc || typeof rpc.getTokenAccountsByOwner !== "function") {
      logger.error("[RpcFactory] Failed to create valid RPC client");
      throw new Error("Failed to create valid RPC client");
    }
    logger.info("[RpcFactory] RPC client created successfully");

    logger.info("[RpcFactory] Creating subscriptions client...");
    const subscriptions = createSolanaRpcSubscriptions(mainnet(config.wssEndpoint));
    if (!subscriptions || typeof subscriptions.signatureNotifications !== "function") {
      logger.error("[RpcFactory] Failed to create valid subscriptions client");
      throw new Error("Failed to create valid subscriptions client");
    }
    logger.info("[RpcFactory] Subscriptions client created successfully");

    // Test RPC client connectivity
    logger.info("[RpcFactory] Testing RPC client connectivity...");
    try {
      const blockhash = await rpc.getLatestBlockhash().send();
      logger.info(`[RpcFactory] RPC test successful: ${JSON.stringify(blockhash, replacer)}`);
    } catch (err) {
      logger.warn(`[RpcFactory] RPC connectivity test failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new Error("RPC connectivity test failed");
    }

    return { rpc, subscriptions };
  } catch (err) {
    logger.error(`[RpcFactory] Error creating RPC clients: ${err instanceof Error ? err.stack : String(err)}`);
    throw err;
  }
}