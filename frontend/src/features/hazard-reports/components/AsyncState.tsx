import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { LastSynced } from '@/shared/offline/LastSynced';
import type { CachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { Icon } from '@/shared/ui/Icon';

export interface AsyncStateProps<T> {
  resource: CachedResource<T>;
  isEmpty?: (data: T) => boolean;
  emptyMessage: string;
  children: (data: T) => ReactNode;
}
export function AsyncState<T>({ resource, isEmpty, emptyMessage, children }: AsyncStateProps<T>) {
  const t = useT();
  if (resource.error)
    return (
      <Alert tone="danger">
        {translateError(t, resource.error)}{' '}
        <Button variant="secondary" onClick={resource.reload}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  if (resource.data === undefined)
    return (
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-line-soft bg-card">
        <Spinner />
      </div>
    );
  if (isEmpty?.(resource.data))
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line bg-card p-8 text-center text-ink-soft">
        <Icon name="fileText" size={32} />
        <p className="max-w-md text-sm leading-6">{emptyMessage}</p>
      </div>
    );
  return (
    <>
      {children(resource.data)}
      <LastSynced syncedAt={resource.syncedAt} />
    </>
  );
}
