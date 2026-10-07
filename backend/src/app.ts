import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './shared/config/env';
import { createErrorHandler, notFoundHandler } from './shared/errors';
import { csrfProtection } from './shared/http/csrf';
import { requestLogger } from './shared/http/requestLogger';
import type { Logger } from './shared/logging/Logger';
import type { ModuleRegistration } from './shared/module';

export interface AppDeps {
  config: Pick<AppConfig, 'corsOrigins' | 'trustProxy' | 'isProduction'>;
  logger: Logger;
  authRouter: Router;
  modules: readonly ModuleRegistration[];
}

/** Map tiles are the only third-party host the pages may load from (master plan §7.1.7). */
const MAP_TILE_HOST = 'https://*.tile.openstreetmap.org';

/**
 * Assembles the HTTP application. Written once and then frozen: a new use case plugs in through its
 * `ModuleRegistration`, never by editing this file.
 */
export function createApp({ config, logger, authRouter, modules }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', MAP_TILE_HOST],
          styleSrc: ["'self'", "'unsafe-inline'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: [...config.corsOrigins], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger(logger));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', csrfProtection(config.corsOrigins));
  app.use('/api/auth', authRouter);
  for (const module of modules) app.use(module.mountPath, module.router);

  if (!config.isProduction) {
    for (const module of modules) {
      if (module.devRouter) app.use('/api/dev', module.devRouter);
    }
  }

  app.use('/api', notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
