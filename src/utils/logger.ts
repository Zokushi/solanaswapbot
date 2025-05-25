// src/utils/logger.ts
import winston from 'winston';
import colors from 'colors';
import { TradeBotError } from './error.js';

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

const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const componentTagMatch = typeof message === 'string' ? message.match(/^\[.*?\]/) : null;
  const componentTag = componentTagMatch ? componentTagMatch[0] : '';
  const messageBody = componentTagMatch
    ? (typeof message === 'string' ? message.slice(componentTag.length).trim() : String(message))
    : (typeof message === 'string' ? message : String(message));

  let styledMessage = messageBody;
  if (messageBody.includes('Fetching') || messageBody.includes('Requesting quote')) {
    styledMessage = messageBody.blue;
  } else if (messageBody.includes('balance') || messageBody.includes('Balance')) {
    styledMessage = messageBody.magenta;
  } else if (messageBody.includes('trade') || messageBody.includes('Trade') || messageBody.includes('Swap')) {
    styledMessage = colors.bold.green(messageBody);
  }

  const styledTag = componentTag ? componentTag.cyan : '';
  const styledLevel = level === 'info' ? '[INFO]'.green : level === 'warn' ? '[WARN]'.yellow : '[ERROR]'.red;
  const styledTimestamp = timestamp ? colors.gray(String(timestamp)) : colors.gray('');

  let errorDetails = '';
  if (meta.error instanceof TradeBotError) {
    const err = meta.error as TradeBotError;
    errorDetails = `\n  Code: ${err.code}\n  Details: ${JSON.stringify(err.details, null, 2)}`;
  } else if (meta.error && typeof meta.error === 'object') {
    errorDetails = `\n  Details: ${JSON.stringify(meta.error, null, 2)}`;
  }

  return `${styledTimestamp} ${styledLevel} ${styledTag} ${styledMessage}${errorDetails}`;
});

const logger = winston.createLogger({
  level: 'warn', // Changed to warn
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' }),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export default logger;