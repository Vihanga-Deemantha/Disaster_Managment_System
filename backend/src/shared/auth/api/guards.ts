import type { Request, RequestHandler } from 'express';
import type { Role } from '../../contracts/enums';
import { ForbiddenError, UnauthorizedError } from '../../errors/DomainError';
import type { Clock } from '../../time/Clock';
import type { AccessTokenService } from '../application/ports';
import { getAuth, setAuth } from './authContext';
import { ACCESS_COOKIE, readCookie } from './cookies';

/**
 * What a route says it concerns. Express types `req.params.x` and `req.query.x` as
 * `string | string[]`, so extractors may return that directly.
 */
export type ScopeValue = string | readonly string[] | undefined;

/** Where a route says which district or organisation it concerns. Compared to the token's claims. */
export interface ScopeRule {
  district?: (req: Request) => ScopeValue;
  organizationId?: (req: Request) => ScopeValue;
}

/** The authorisation helpers every module uses (master plan §7.1.5). Always decided on the server. */
export interface AuthGuards {
  /** A valid access token, else 401. Must come first: the others read what it verified. */
  requireAuth: RequestHandler;
  /** The caller has one of these roles, else 403 `FORBIDDEN_ROLE`. */
  requireRole(...roles: Role[]): RequestHandler;
  /**
   * A caller whose token carries a district / organisation may only touch that one, else 403
   * `FORBIDDEN_SCOPE`. Roles without such a claim (e.g. DMC Officer) are national and pass.
   */
  requireScope(rule: ScopeRule): RequestHandler;
  /** Step-up: the password was re-entered within `maxAgeSeconds`, else 401 `REAUTH_REQUIRED` (BR3). */
  requireRecentAuth(maxAgeSeconds: number): RequestHandler;
}

export interface GuardDeps {
  accessTokens: AccessTokenService;
  clock: Clock;
}

/**
 * A caller with a claim may only touch that one value. A route that names nothing, or several
 * values (one of them someone else's), cannot be proven to be inside the scope, so it is refused.
 */
function assertWithinScope(claim: string | undefined, target: ScopeValue, what: string): void {
  if (claim === undefined) return;
  const requested = typeof target === 'string' ? [target] : [...(target ?? [])];
  if (requested.length === 0 || requested.some((value) => value !== claim)) {
    throw new ForbiddenError('FORBIDDEN_SCOPE', `You may only access your own ${what}.`);
  }
}

export function createAuthGuards({ accessTokens, clock }: GuardDeps): AuthGuards {
  return {
    requireAuth: (req, _res, next) => {
      const token = readCookie(req, ACCESS_COOKIE);
      if (!token) throw new UnauthorizedError('UNAUTHENTICATED', 'Sign in required.');
      setAuth(req, accessTokens.verify(token));
      next();
    },

    requireRole:
      (...roles) =>
      (req, _res, next) => {
        if (!roles.includes(getAuth(req).role)) {
          throw new ForbiddenError('FORBIDDEN_ROLE', 'Your role is not allowed to do this.');
        }
        next();
      },

    requireScope: (rule) => (req, _res, next) => {
      const auth = getAuth(req);
      if (rule.district) assertWithinScope(auth.district, rule.district(req), 'district');
      if (rule.organizationId) {
        assertWithinScope(auth.organizationId, rule.organizationId(req), 'organisation');
      }
      next();
    },

    requireRecentAuth: (maxAgeSeconds) => (req, _res, next) => {
      const ageSeconds = (clock.now().getTime() - getAuth(req).authenticatedAt.getTime()) / 1000;
      if (ageSeconds > maxAgeSeconds) {
        throw new UnauthorizedError('REAUTH_REQUIRED', 'Please confirm your password again.');
      }
      next();
    },
  };
}
