import pino from 'pino';

/** Minimal structured logger so application code does not depend on a logging library. */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const nullLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Never let credentials or identity numbers reach a log line, even by accident. */
const REDACTED_PATHS = [
  'password',
  'currentPassword',
  'newPassword',
  'nic',
  'token',
  'refreshToken',
  'accessToken',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.nic',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  'headers.cookie',
  'headers.authorization',
];

export interface LoggerOptions {
  level: string;
  /** Human-readable output for local development. */
  pretty: boolean;
}

/** The pino configuration, kept separate so redaction and the dev transport can be tested. */
export function pinoOptions({ level, pretty }: LoggerOptions): pino.LoggerOptions {
  return {
    level,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  };
}

/** `destination` exists for tests; in the app, logs go to stdout. */
export function createLogger(options: LoggerOptions, destination?: pino.DestinationStream): Logger {
  const base = pino(pinoOptions(options), destination);
  return {
    debug: (message, context) => base.debug(context ?? {}, message),
    info: (message, context) => base.info(context ?? {}, message),
    warn: (message, context) => base.warn(context ?? {}, message),
    error: (message, context) => base.error(context ?? {}, message),
  };
}
