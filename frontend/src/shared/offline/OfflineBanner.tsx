import type { MeResponse } from '@contracts/auth';
import { useAuth } from '@/shared/auth/AuthContext';
import { useT } from '@/shared/i18n/I18nProvider';
import { Button } from '@/shared/ui/Button';
import type { OutboxRow } from './db';
import { useOutboxRows, useSync, useSyncStatus } from './SyncProvider';
import { useOnlineStatus } from './useOnlineStatus';

function OfflineNotice({ user }: { user: MeResponse | null }) {
  const t = useT();
  return (
    <div role="status" className="bg-warning-100 px-4 py-2 text-sm text-warning-600">
      <strong>{t('offline.banner')}</strong>
      {user ? (
        <span className="ml-2">{t('offline.signedInAs', { name: user.displayName })}</span>
      ) : null}
    </div>
  );
}

function QueueNotice({ waiting, syncing }: { waiting: number; syncing: boolean }) {
  const t = useT();
  return (
    <div role="status" className="bg-info-100 px-4 py-2 text-sm text-info-600">
      {syncing ? t('offline.syncing') : t('offline.queued', { count: waiting })}
    </div>
  );
}

function RejectedNotice({ row }: { row: OutboxRow }) {
  const t = useT();
  const sync = useSync();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 bg-danger-100 px-4 py-2 text-sm text-danger-600"
    >
      <span>{t('offline.syncFailed', { reason: row.lastError ?? '' })}</span>
      <Button variant="secondary" onClick={() => void sync.retryBlocked(row.seq)}>
        {t('offline.retry')}
      </Button>
      <Button variant="ghost" onClick={() => void sync.discard(row.seq)}>
        {t('offline.discard')}
      </Button>
    </div>
  );
}

/**
 * One consistent banner for every module (master plan §6): are we offline, who is signed in, how many
 * changes are waiting, and — if the server refused one — a way to retry or discard it.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { user } = useAuth();
  const status = useSyncStatus();
  const rows = useOutboxRows(user?.userId);
  const waiting = rows.filter((row) => row.status === 'PENDING').length;
  const rejected = rows.find((row) => row.status === 'FAILED');

  if (online && waiting === 0 && !rejected) return null;
  return (
    <div className="space-y-px">
      {online ? null : <OfflineNotice user={user} />}
      {waiting > 0 ? <QueueNotice waiting={waiting} syncing={status.state === 'syncing'} /> : null}
      {rejected ? <RejectedNotice row={rejected} /> : null}
    </div>
  );
}
