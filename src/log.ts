import pino from 'pino';
import { errorCode } from './types.js';
export const logger = pino({level: process.env.LOG_LEVEL || 'info', base: undefined,
  redact: ['token', 'authorization', 'apiKey', 'text', 'content', 'message.content', '*.token']});
// Never serialize SDK exceptions: their request bodies can contain message text or credentials.
export function logError(event: string, error: unknown): void {
  logger.error({event, code: errorCode(error)});
}
