import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError, NetworkError } from '@/shared/api/errors';
import { parseInbox } from '../domain/parseInbox';
import type { AlertsGateway } from '../domain/ports';
import { InboxUnavailable, type InboxSnapshot } from '../domain/types';

/** Why a request failed, in the terms the inbox cares about. */
function unavailable(error: unknown): InboxUnavailable {
  if (error instanceof NetworkError) return new InboxUnavailable('OFFLINE');
  const sessionEnded = error instanceof ApiError && error.status === 401;
  return new InboxUnavailable(sessionEnded ? 'SESSION_EXPIRED' : 'SERVER');
}

/**
 * `GET /api/me/alerts`: the warnings sent to the signed-in citizen. The API client has already tried
 * to refresh an expired session once, so a 401 that reaches here means the person must sign in again.
 */
export class HttpAlertsGateway implements AlertsGateway {
  constructor(private readonly api: ApiClient) {}

  async fetchInbox(): Promise<InboxSnapshot> {
    let body: unknown;
    try {
      body = await this.api.request<unknown>('GET', '/api/me/alerts');
    } catch (error) {
      throw unavailable(error);
    }
    const inbox = parseInbox(body);
    if (!inbox) throw new InboxUnavailable('SERVER');
    return inbox;
  }
}
