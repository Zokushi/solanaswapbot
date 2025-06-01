import winston from 'winston';
import path from 'path';
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3, // Added debug level
    component: 4,
    fetching: 5,
    balance: 6,
    trade: 7,
    separator: 8,
  },
  colors: {
    info: 'green',
    warn: 'yellow',
    error: 'red',
    component: 'cyan',
    fetching: 'blue',
    balance: 'magenta',
    trade: 'bold green',
    separator: 'gray',
  },
};

winston.addColors(customLevels.colors);

// Structured JSON format for file logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' }),
  winston.format.json()
);

// Pretty-printed format for console (for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, service = 'unknown', ...metadata }) => {
    const componentTagMatch = typeof message === 'string' ? message.match(/^\[.*?\]/) : null;
    const componentTag = componentTagMatch ? componentTagMatch[0] : '';
    const messageBody = componentTagMatch
      ? (message as string).slice(componentTag.length).trim()
      : message;

    let errorDetails = '';
    if (metadata.error) {
      errorDetails = `\n  Details: ${JSON.stringify(metadata.error, null, 2)}`;
    }

    return `${timestamp} [${level.toUpperCase()}] [${service}] ${componentTag} ${messageBody}${errorDetails}`;
  })
);

export interface LogMetadata {
  service?: string;
  botId?: string;
  method?: string;
  error?: Record<string, any>;
  [key: string]: any;
}

export const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'debug', // Allow debug logs
  format: winston.format.combine(winston.format.errors({ stack: true }), jsonFormat),
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: false,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true,
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, 'daily-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '5m',
      maxFiles: '14d',
      format: jsonFormat,
    }),
  ],
});

export type CustomLogger = winston.Logger & {
  info: (message: string, meta?: LogMetadata) => void;
  warn: (message: string, meta?: LogMetadata) => void;
  error: (message: string, meta?: LogMetadata) => void;
  debug: (message: string, meta?: LogMetadata) => void; // Added debug
};

export function createLogger(service: string): CustomLogger {
  return logger.child({ service }) as CustomLogger;
}