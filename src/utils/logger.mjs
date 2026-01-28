import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const LOGS_DIR = join(ROOT_DIR, 'logs');

// Ensure logs directory exists
mkdirSync(join(LOGS_DIR, 'daily'), { recursive: true });

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return stack
      ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
      : `${timestamp} [${level.toUpperCase()}] ${message}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [
    // Console output with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // Main log file
    new winston.transports.File({
      filename: join(LOGS_DIR, 'automation.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      format: jsonFormat
    }),
    // Error-only log
    new winston.transports.File({
      filename: join(LOGS_DIR, 'error.log'),
      level: 'error',
      format: jsonFormat
    }),
    // Daily rotation
    new DailyRotateFile({
      filename: join(LOGS_DIR, 'daily', '%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: jsonFormat
    })
  ]
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

export default logger;
