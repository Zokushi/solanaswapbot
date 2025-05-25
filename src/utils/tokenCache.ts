import NodeCache from 'node-cache';
import { getTokenList } from './helper.js';

// Cache tokens for 1 hour (3600 seconds)
const tokenCache = new NodeCache({ stdTTL: 3600 });

export interface Token {
  address: string;
  name: string;
  symbol: string;
}

export async function getCachedTokens(): Promise<Token[]> {
  // Try to get tokens from cache first
  const cachedTokens = tokenCache.get<Token[]>('tokens');
  if (cachedTokens) {
    return cachedTokens;
  }

  // If not in cache, fetch from API
  const tokens = await getTokenList();
  
  // Store in cache
  tokenCache.set('tokens', tokens);
  
  return tokens;
}

// Force refresh the cache
export async function refreshTokenCache(): Promise<Token[]> {
  const tokens = await getTokenList();
  tokenCache.set('tokens', tokens);
  return tokens;
} 