import { pino } from 'pino';
import { env, isDevelopment } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
