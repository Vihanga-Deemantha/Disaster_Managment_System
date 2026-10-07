import type { RequestHandler } from 'express';
import type { Logger } from '../logging/Logger';

/** One line per request: method, path (never the query string or body), status and duration. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/api/health') return;
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
      });
    });
    next();
  };
}
