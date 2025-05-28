// tokenService.ts
import NodeCache from "node-cache";
import { ENV } from "../config/index.js";
import logger from "./logger.js";
import prisma from "./prismaClient.js";

/**
 * Fetches the decimals for a token by its name.
 *
 * @param tokenName - The name of the token.
 * @returns An object containing the decimals of the token.
 */
export async function getTokenDecimalsByName(tokenName: string): Promise<{ decimals: number }> {
  try {
    const tokens = await prisma.token.findFirst({
      where: {
        OR: [
          { symbol: { equals: tokenName } },
          { name: { equals: tokenName } }
        ]
      },
      select: { decimals: true },
    });

    if (!tokens) {
      throw new Error(`Token with name "${tokenName}" not found.`);
    }

    return { decimals: tokens.decimals };
  } catch (error) {
    throw error;
  }
}

/**
 * Calculates the token value with decimals applied, using the token's blockchain address.
 *
 * @param address - The blockchain address of the token.
 * @param value - The raw token value without decimals.
 * @returns The token value with decimals applied.
 * @throws Will throw an error if the token is not found or a database error occurs.
 */
export async function getTokenDecimalsByAddress(address: string, value: number): Promise<number> {
  try {
    const token = await prisma.token.findUnique({
      where: { address },
    });

    if (!token) {
      throw new Error(`Token with address "${address}" not found.`);
    }

    const tokenValue = value / Math.pow(10, token.decimals);
    return parseFloat(tokenValue.toFixed(2));
  } catch (error) {
    throw error;
  }
}

export async function getTokenDecimalsByAddressRaw(address: string): Promise<number> {
  try {
    const token = await prisma.token.findUnique({
      where: { address },
    });

    if (!token) {
      throw new Error(`Token with address "${address}" not found.`);
    }

    return token.decimals;
  } catch (error) {
    throw error;
  }
}

export async function addTokenDecimalsByAddress(address: string, value: number): Promise<number> {
  try {
    const token = await prisma.token.findUnique({
      where: { address },
    });

    if (!token) {
      throw new Error(`Token with address "${address}" not found.`);
    }

    const tokenValue = value * Math.pow(10, token.decimals);
    return tokenValue;
  } catch (error) {
    throw error;
  }
}

interface dexScreenerRewquest {
  "schemaVersion": string,
  "pairs": [
    {
      "chainId": string,
      "dexId": string,
      "url": string,
      "pairAddress": string,
      "labels": [
        string
      ],
      "baseToken": {
        "address": string,
        "name": string,
        "symbol": string
      },
      "quoteToken": {
        "address": string,
        "name": string,
        "symbol": string
      },
      "priceNative": string,
      "priceUsd": string,
      "liquidity": {
        "usd": number,
        "base": number,
        "quote": number
      },
      "fdv": number,
      "marketCap": number,
      "pairCreatedAt": number,
      "info": {
        "imageUrl": string,
        "websites": [
          {
            "url": string
          }
        ],
        "socials": [
          {
            "platform": string,
            "handle": string
          }
        ]
      },
      "boosts": {
        "active": number
      }
    }
  ]
}
/**
 * Fetches the name of a token by its blockchain address.
 *
 * @param address - The blockchain address of the token.
 * @returns The name of the token.
 * @throws Will throw an error if the token is not found or a database error occurs.
 */
export async function getTokenName(address: string): Promise<string> {
  try {
    const tokens = await prisma.token.findMany({
      where: { address },
    });

    if (!tokens.length) {
      logger.warn(`[TokenService] Token with address ${address} not in strict list. Checking if it's a token account`);
      try {
        const accountInfo = await fetch(`${ENV.solanaEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [address, { encoding: "jsonParsed" }],
          }),
        }).then((res) => res.json());
        if (accountInfo.result && accountInfo.result.value && accountInfo.result.value.data.parsed.info.mint) {
          const mint = accountInfo.result.value.data.parsed.info.mint;
          const dexScreener = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            method: "GET",
            headers: {},
          });
          const data: dexScreenerRewquest = await dexScreener.json();
          if (data && data.pairs && data.pairs.length > 0) {
            const name = data.pairs[0].baseToken.name;
            if (name) {
              logger.info(`[TokenService] Found token name ${name} for mint ${mint} via DexScreener`);
              return name;
            }
          }
        }
        logger.error(`[TokenService] No mint data or DexScreener response for account ${address}`);
        return address;
      } catch (dexError) {
        logger.error(`[TokenService] Error fetching account info or DexScreener for ${address}: ${dexError instanceof Error ? dexError.message : String(dexError)}`);
        return address;
      }
    } else {
      logger.info(`[TokenService] Found token name ${tokens[0].name} for address ${address} in database`);
      return tokens[0].name;
    }
  } catch (error) {
    logger.error(`[TokenService] Error getting token name for address ${address}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Formats a numeric price to 4 decimal places.
 *
 * @param price - The numeric price to format.
 * @returns The formatted price or undefined if the price is invalid.
 */
export function formatPrice(price: number): number | undefined {
  try {
    if (price < 0) {
      throw new Error("Price cannot be negative");
    }
    return parseFloat(price.toFixed(4));
  } catch (error) {
    return undefined;
  }
}

/**
 * Formats a numeric value as a percentage with 2 decimal places.
 *
 * @param value - The numeric value to format.
 * @returns The formatted percentage value.
 */
export function formatPercentage(value: number): number {
  return parseFloat(value.toFixed(2));
}
const cache = new NodeCache({ stdTTL: 300 }); // 5-minute TTL
export async function getTokenList(): Promise<{ name: string; address: string; symbol: string }[]> {
  const cached = cache.get('tokenList');
  if (Array.isArray(cached)) {
    return cached as { name: string; address: string; symbol: string }[];
  }
  try {
    const tokens = await prisma.token.findMany({
      select: { name: true, address: true, symbol: true },
    });
    if (tokens.length === 0) {
      logger.warn('No tokens found in the database. Please seed the token table.');
    }
    const tokenList = tokens.map(token => ({
      name: token.name,
      address: token.address,
      symbol: token.symbol,
    }));
    cache.set('tokenList', tokenList);
    return tokenList;
  } catch (error) {
    logger.error(`Failed to fetch token list: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}


export async function getTokenAddressByName(name: string): Promise<string> {
  try {
    if (!name || typeof name !== 'string') {
      logger.error(`Invalid input to getTokenAddressByName: ${JSON.stringify(name)}`);
      throw new Error('Token name must be a non-empty string');
    }
    const lowerName = name.toLowerCase();
    const token = await prisma.token.findFirst({
      where: {
        OR: [
          { name: { contains: lowerName } },
          { symbol: { contains: lowerName } },
        ],
      },
      select: { address: true },
    });
    if (!token) {
      logger.error(`Token not found for input: ${name}`);
      throw new Error(`Token ${name} not found`);
    }
    return token.address;
  } catch (error) {
    logger.error(`getTokenAddressByName error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export function shortenUUID(uuid: string): string {
  // Take first 8 characters and last 4 characters
  return `${uuid.slice(0, 8)}`;
}