import dotenv from 'dotenv';
import fs from 'fs';
import logger from '../utils/logger.js';

dotenv.config();
function reloadEnv() {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}
reloadEnv();

export const ENV = {
  PORT: process.env.PORT || 4000,
  wallet: process.env.KEY,
  solanaEndpoint: process.env.RPC_URL,
  wss: process.env.WSS_URL,
  // Add other environment variables here
};

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