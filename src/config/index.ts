import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

// Load environment variables
dotenv.config({ path: envPath });

function reloadEnv() {
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
    logger.info('Environment variables loaded successfully');
  } catch (error) {
    logger.error('Failed to load environment variables:', error);
    throw error;
  }
}

reloadEnv();

export const ENV = {
  PORT: process.env.PORT || 4000,
  wallet: process.env.KEY,
  solanaEndpoint: process.env.RPC_URL,
  wss: process.env.WSS_URL,
  SOCKET_URL: process.env.SOCKET_URL || 'http://localhost:4000'
} as const;

export function checkVariables() {
  const requiredVars = ['KEY', 'RPC_URL', 'WSS_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('Required environment variables are not set:', missingVars);
  }
  
  return {
    success: missingVars.length === 0,
    missingVars
  };
}    