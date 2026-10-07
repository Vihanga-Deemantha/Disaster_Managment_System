import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  reauthSchema,
  registerSchema,
  type AuthResponse,
} from '../../contracts/auth';
import { UnauthorizedError } from '../../errors/DomainError';
import { parseOrThrow } from '../../errors/zod';
import { getRequestMeta } from '../../http/requestMeta';
import type { AuthService, SessionTokens } from '../application/AuthService';
import type { AccessTokenService } from '../application/ports';
import type { AuthContext } from '../domain/types';
import { getAuth } from './authContext';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  readCookie,
  setAccessCookie,
  setSessionCookies,
} from './cookies';
import type { AuthGuards } from './guards';
import { DEFAULT_AUTH_LIMITS, createLimiter, type AuthRateLimits } from './rateLimit';

export interface AuthRouterDeps {
  service: AuthService;
  guards: AuthGuards;
  accessTokens: AccessTokenService;
  cookieSecure: boolean;
  limits?: AuthRateLimits;
}

/** Sign-out must work even when the access token has already expired, so a bad token is not an error here. */
function tryVerify(
  accessTokens: AccessTokenService,
  token: string | undefined,
): AuthContext | undefined {
  if (!token) return undefined;
  try {
    return accessTokens.verify(token);
  } catch {
    return undefined;
  }
}

/** Sets the session cookies and answers with the signed-in user (never the tokens themselves). */
function respondWithSession(
  res: Response,
  tokens: SessionTokens,
  body: AuthResponse,
  secure: boolean,
  status = 200,
): void {
  setSessionCookies(res, tokens, secure);
  res.status(status).json(body);
}

/** Handlers that create a sign-in: registration and login. */
function entryHandlers({ service, cookieSecure: secure }: AuthRouterDeps) {
  const register: RequestHandler = async (req, res) => {
    const result = await service.register(
      parseOrThrow(registerSchema, req.body),
      getRequestMeta(req),
    );
    respondWithSession(res, result.tokens, { user: result.user }, secure, 201);
  };

  const login: RequestHandler = async (req, res) => {
    const result = await service.login(parseOrThrow(loginSchema, req.body), getRequestMeta(req));
    respondWithSession(res, result.tokens, { user: result.user }, secure);
  };

  return { register, login };
}

/** Handlers that keep or end a sign-in: refresh rotation and logout. */
function lifecycleHandlers({ service, accessTokens, cookieSecure: secure }: AuthRouterDeps) {
  const refresh: RequestHandler = async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (!refreshToken) throw new UnauthorizedError('SESSION_INVALID', 'No session to refresh.');
    try {
      const result = await service.refresh(refreshToken, getRequestMeta(req));
      respondWithSession(res, result.tokens, { user: result.user }, secure);
    } catch (error) {
      // A dead session must not keep presenting its cookies; a benign rotation race must.
      const rotatedJustNow = error instanceof UnauthorizedError && error.code === 'TOKEN_ROTATED';
      if (!rotatedJustNow) clearSessionCookies(res, secure);
      throw error;
    }
  };

  const logout = async (req: Request, res: Response): Promise<void> => {
    const context = tryVerify(accessTokens, readCookie(req, ACCESS_COOKIE));
    await service.logout(
      { refreshToken: readCookie(req, REFRESH_COOKIE), context },
      getRequestMeta(req),
    );
    clearSessionCookies(res, secure);
    res.status(204).end();
  };

  return { refresh, logout };
}

/** Handlers for an already signed-in user (the router puts `requireAuth` in front of them). */
function accountHandlers({ service, cookieSecure: secure }: AuthRouterDeps) {
  const reauth: RequestHandler = async (req, res) => {
    const { password } = parseOrThrow(reauthSchema, req.body);
    const result = await service.reauth(getAuth(req), password, getRequestMeta(req));
    setAccessCookie(res, result.accessToken, result.accessExpiresAt, secure);
    res.json({ user: result.user } satisfies AuthResponse);
  };

  const me: RequestHandler = async (req, res) => {
    res.json({ user: await service.me(getAuth(req)) } satisfies AuthResponse);
  };

  const changePassword: RequestHandler = async (req, res) => {
    const input = parseOrThrow(changePasswordSchema, req.body);
    await service.changePassword(getAuth(req), input, getRequestMeta(req));
    clearSessionCookies(res, secure);
    res.status(204).end();
  };

  return { reauth, me, changePassword };
}

/**
 * HTTP routes for `/api/auth/*`: parse the body, call `AuthService`, map the result to cookies and
 * JSON. No business rule lives here (master plan §11).
 */
export function createAuthRouter(deps: AuthRouterDeps): Router {
  const limits = deps.limits ?? DEFAULT_AUTH_LIMITS;
  const { requireAuth } = deps.guards;
  const entry = entryHandlers(deps);
  const lifecycle = lifecycleHandlers(deps);
  const account = accountHandlers(deps);
  const router = Router();

  router.post('/register', createLimiter(limits.register), entry.register);
  router.post('/login', createLimiter(limits.login), entry.login);
  router.post('/refresh', createLimiter(limits.refresh), lifecycle.refresh);
  router.post('/logout', lifecycle.logout);
  router.post('/reauth', createLimiter(limits.reauth), requireAuth, account.reauth);
  router.get('/me', requireAuth, account.me);
  router.post('/change-password', requireAuth, account.changePassword);
  return router;
}
