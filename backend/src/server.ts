import type { Server } from 'node:http';
import { buildApplication } from './bootstrap';
import { ConfigError, loadConfig, loadEnvFileIfPresent } from './shared/config/env';
import { connectMongo, disconnectMongo } from './shared/db/connection';
import { createLogger, type Logger } from './shared/logging/Logger';

function shutDownGracefully(server: Server, logger: Logger): void {
  const stop = (signal: string): void => {
    logger.info('Shutting down', { signal });
    server.close(() => {
      void disconnectMongo().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: !config.isProduction });
  await connectMongo(config.mongoUri);
  const { app } = await buildApplication(config, logger);
  const server = app.listen(config.port, () => {
    logger.info('Safe Zone API listening', { port: config.port, env: config.env });
  });
  shutDownGracefully(server, logger);
}

main().catch((error: unknown) => {
  // A missing secret or unreachable database should read as a message, not a stack trace.
  const message =
    error instanceof ConfigError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
});
