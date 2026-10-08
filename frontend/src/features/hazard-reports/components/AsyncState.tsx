import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { LastSynced } from '@/shared/offline/LastSynced';
import type { CachedResource } from '@/shared/offline/useCachedResource';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';

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
  if (resource.data === undefined) return <Spinner />;
  if (isEmpty?.(resource.data)) return <p>{emptyMessage}</p>;
  return (
    <>
      {children(resource.data)}
      <LastSynced syncedAt={resource.syncedAt} />
    </>
  );
}
