import { useCallback } from 'react';
import { useApi } from '@/shared/api/ApiProvider';
import { NetworkError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/AuthContext';
import type { OutboxMethod } from './db';
import { outbox } from './outbox';
import { useOnlineStatus } from './useOnlineStatus';

export interface WriteRequest {
  module: string;
  method: OutboxMethod;
  url: string;
  body?: unknown;
}

export type WriteResult<T> = { queued: false; data: T } | { queued: true };

/**
 * The write side of offline support (master plan §6). Sends the change now when online. When there
 * is no connection it parks the change in the outbox instead, to be replayed in order later.
 * Either way the same idempotency key travels with it, so it is applied once (BR5).
 *
 * Only use this for changes that are safe to apply later. Actions whose result the person must see
 * immediately (UC-1 Approve & Issue) should be disabled offline instead: check `useOnlineStatus()`.
 */
export function useOfflineWrite() {
  const api = useApi();
  const online = useOnlineStatus();
  const ownerId = useAuth().user?.userId;

  return useCallback(
    async <T>(request: WriteRequest): Promise<WriteResult<T>> => {
      const idempotencyKey = crypto.randomUUID();
      if (online) {
        try {
          const data = await api.request<T>(request.method, request.url, request.body, {
            idempotencyKey,
          });
          return { queued: false, data };
        } catch (error) {
          if (!(error instanceof NetworkError)) throw error;
        }
      }
      if (!ownerId) throw new Error('A change cannot be queued without a signed-in user.');
      await outbox.enqueue(ownerId, { ...request, idempotencyKey });
      return { queued: true };
    },
    [api, online, ownerId],
  );
}
