import { TokenInfo } from "../core/types.js";
import prisma from "../utils/prismaClient.js";
import fetch from "node-fetch";
import logger from "../utils/logger.js";

const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export async function fetchTokenList(forceUpdate: boolean = false) {
    try {
        // Check if we need to update the token list
        const lastUpdate = await prisma.token.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });

        const now = new Date();
        const shouldUpdate = forceUpdate || !lastUpdate || 
            (now.getTime() - lastUpdate.updatedAt.getTime() > UPDATE_INTERVAL);

        if (!shouldUpdate) {
            logger.info('Token list is up to date, skipping update');
            return;
        }

        logger.info('Fetching latest token data from Jupiter API...');
        const lstTaggedResponse = await (
            await fetch('https://lite-api.jup.ag/tokens/v1/tagged/verified')
        ).json();

        // If lstTaggedResponse is an array of tokens, update each one
        if (Array.isArray(lstTaggedResponse)) {
            logger.info(`Found ${lstTaggedResponse.length} tokens to update`);
            for (const token of lstTaggedResponse) {
                await updateTokenData(token as TokenInfo);
            }
        } else {
            // If it's a single token object
            await updateTokenData(lstTaggedResponse as TokenInfo);
        }

        logger.info('Token list updated successfully');
    } catch (error) {
        logger.error(`Failed to fetch token list: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

export async function updateTokenData(tokenInfo: TokenInfo) {
    try {
        // First try to find the existing token
        const existingToken = await prisma.token.findUnique({
            where: { address: tokenInfo.address }
        });

        if (existingToken) {
            // Update existing token
            const tokenData = await prisma.token.update({
                where: { id: existingToken.id },
                data: {
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    decimals: tokenInfo.decimals,
                    logoURI: tokenInfo.logoURI,
                    updatedAt: new Date()
                }
            });
            return tokenData;
        } else {
            // Create new token
            const tokenData = await prisma.token.create({
                data: {
                    address: tokenInfo.address,
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    decimals: tokenInfo.decimals,
                    logoURI: tokenInfo.logoURI,
                    updatedAt: new Date()
                }
            });
            return tokenData;
        }
    } catch (error) {
        logger.error(`Error updating token data: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

export async function getTokenDataList() {
  try {
    const tokenDataList = await prisma.token.findMany();
    return tokenDataList;
  } catch (error) {
    console.error("Error fetching token data list:", error);
    throw error;
  }
}

export async function getSingleTokenData(address: string) {
  try {
    const tokenData = await prisma.token.findUnique({
      where: { address },
    });
    return tokenData;
  } catch (error) {
    console.error("Error fetching token data:", error);
    throw error;
  }
}