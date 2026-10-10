import { useRef, useState } from 'react';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { answerDuplicate, sendWithoutPhoto } from '../offline/submitReport';
import type { SubmitNowResult } from '../offline/SyncManager';
import type { MyReportsDependencies } from './MyReportsController';

export function useReportActions(
  ownerId: string,
  deps: MyReportsDependencies,
  reload: () => Promise<void>,
) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey>();
  async function run(work: () => Promise<MessageKey>): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage(await work());
      await reload();
    } catch {
      setMessage('reports.mine.actionError');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const choice = (id: string, action: 'NEW' | 'UPDATE') =>
    run(async () => outcomeMessage(await answerDuplicate(deps, ownerId, id, action)));
  const withoutPhoto = (id: string) =>
    run(async () => outcomeMessage(await sendWithoutPhoto(deps, ownerId, id)));
  const discard = (id: string) =>
    run(async () => {
      const entry = await deps.queue.get(id);
      if (!entry || entry.ownerId !== ownerId || entry.state !== 'NEEDS_ATTENTION')
        return 'reports.mine.actionError';
      await deps.queue.remove(id);
      return 'reports.mine.discarded';
    });
  return { busy, message, choice, withoutPhoto, discard };
}
function outcomeMessage(outcome: SubmitNowResult): MessageKey {
  const messages: Record<SubmitNowResult['kind'], MessageKey> = {
    DELIVERED: 'reports.sent',
    ALREADY_SENT: 'reports.sent',
    SAVED_OFFLINE: 'reports.savedOffline',
    AUTH_REQUIRED: 'reports.authRequired',
    RETRY: 'reports.savedOffline',
    DUPLICATE_SUSPECTED: 'reports.duplicate',
    REJECTED: 'reports.refused',
  };
  return messages[outcome.kind];
}
