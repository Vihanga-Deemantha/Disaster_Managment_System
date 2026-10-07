import type { CookieOptions, Request, Response } from 'express';
import type { SessionTokens } from '../application/AuthService';

export const ACCESS_COOKIE = 'sz_access';
export const REFRESH_COOKIE = 'sz_refresh';
/**
 * Narrower than the whole site but wider than `/api/auth/refresh`: logout and re-auth must also
 * receive the refresh cookie, while no other route ever sees it.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

/** httpOnly keeps scripts away from the tokens; SameSite=Strict keeps them off cross-site requests. */
const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'strict',
});

export function setAccessCookie(
  res: Response,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  res.cookie(ACCESS_COOKIE, token, { ...baseOptions(secure), path: '/', expires });
}

export function setSessionCookies(res: Response, tokens: SessionTokens, secure: boolean): void {
  setAccessCookie(res, tokens.accessToken, tokens.accessExpiresAt, secure);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(secure),
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(secure), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(secure), path: REFRESH_COOKIE_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
