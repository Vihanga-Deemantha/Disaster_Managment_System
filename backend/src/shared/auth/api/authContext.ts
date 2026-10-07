import type { Request } from 'express';
import { UnauthorizedError } from '../../errors/DomainError';
import type { AuthContext } from '../domain/types';

/**
 * The verified caller of a request. Kept in a WeakMap rather than bolted onto Express's `Request`
 * type, so there is no global type augmentation and nothing a client-supplied field can overwrite.
 */
const contexts = new WeakMap<Request, AuthContext>();

export function setAuth(req: Request, context: AuthContext): void {
  contexts.set(req, context);
}

export const tryGetAuth = (req: Request): AuthContext | undefined => contexts.get(req);

/** Whose request this is, for idempotency keys: the signed-in user, else the network address. */
export const callerKey = (req: Request): string => tryGetAuth(req)?.userId ?? req.ip ?? 'anonymous';

/** For handlers behind `requireAuth`: the verified caller. Fails closed if the guard was forgotten. */
export function getAuth(req: Request): AuthContext {
  const context = contexts.get(req);
  if (!context) throw new UnauthorizedError('UNAUTHENTICATED', 'Sign in required.');
  return context;
}
