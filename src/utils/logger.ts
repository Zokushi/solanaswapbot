import winston from 'winston';
import colors from 'colors';
import { TradeBotError } from './error.js';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

winston.addColors({
  info: 'green',
  warn: 'yellow',
  error: 'red',
  component: 'cyan',
  fetching: 'blue',
  balance: 'magenta',
  trade: 'bold green',
  separator: 'gray',
});

// File format without colors
const fileFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const componentTagMatch = typeof message === 'string' ? message.match(/^\[.*?\]/) : null;
  const componentTag = componentTagMatch ? componentTagMatch[0] : '';
  const messageBody = componentTagMatch
    ? (typeof message === 'string' ? message.slice(componentTag.length).trim() : String(message))
    : (typeof message === 'string' ? message : String(message));

  let errorDetails = '';
  if (meta.error instanceof TradeBotError) {
    const err = meta.error as TradeBotError;
    errorDetails = `\n  Code: ${err.code}\n  Details: ${JSON.stringify(err.details, null, 2)}`;
  } else if (meta.error && typeof meta.error === 'object') {
    errorDetails = `\n  Details: ${JSON.stringify(meta.error, null, 2)}`;
  }

  return `${timestamp} [${level.toUpperCase()}] ${componentTag} ${messageBody}${errorDetails}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    // Silent transport to suppress all console output
    new winston.transports.Console({
      silent: true
    }),
    // Error log file - only for actual errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Combined log file - for all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Daily rotating file - for all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'daily-%DATE%.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 14, // Keep logs for 14 days
      tailable: true
    })
  ]
});

export default logger;