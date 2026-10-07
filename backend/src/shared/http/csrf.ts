import type { RequestHandler } from 'express';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../contracts/api';
import { ForbiddenError } from '../errors/DomainError';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defence in depth on top of `SameSite=Strict` cookies (master plan §7.1.3): every state-changing
 * request must carry our custom header, which a cross-site form or image cannot add, and any
 * `Origin` the browser reports must be on the allow-list.
 */
export function csrfProtection(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw new ForbiddenError('CSRF_HEADER_MISSING', `The ${CSRF_HEADER} header is required.`);
    }
    const origin = req.get('Origin');
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      throw new ForbiddenError('CSRF_ORIGIN_REJECTED', 'This origin is not allowed.');
    }
    next();
  };
}
