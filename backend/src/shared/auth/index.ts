/**
 * The public surface of shared authentication. Other modules import from here (`@shared/auth`) and
 * never from its inner folders.
 */
export { callerKey, getAuth, tryGetAuth } from './api/authContext';
export type { AuthGuards, ScopeRule } from './api/guards';
export type { AuthContext, ClientInfo } from './domain/types';
export type { CitizenProfileReader, CitizenProfileView } from './application/CitizenProfileReader';
