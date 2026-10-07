import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../../errors/DomainError';

export interface LimitSpec {
  windowMs: number;
  limit: number;
}

export interface AuthRateLimits {
  login: LimitSpec;
  register: LimitSpec;
  reauth: LimitSpec;
  refresh: LimitSpec;
}

const MINUTE = 60_000;

/** Per-IP limits (master plan §7.1.4): 20 sign-ins per 15 minutes, the rest generous but bounded. */
export const DEFAULT_AUTH_LIMITS: AuthRateLimits = {
  login: { windowMs: 15 * MINUTE, limit: 20 },
  register: { windowMs: 60 * MINUTE, limit: 10 },
  reauth: { windowMs: 15 * MINUTE, limit: 20 },
  refresh: { windowMs: 15 * MINUTE, limit: 120 },
};

/** Rejections go through the shared error handler, so a 429 has the same body shape as every error. */
export function createLimiter({ windowMs, limit }: LimitSpec): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next, options) => {
      next(
        new TooManyRequestsError(
          'RATE_LIMITED',
          'Too many requests from this address. Try again later.',
          Math.ceil(options.windowMs / 1000),
        ),
      );
    },
  });
}
