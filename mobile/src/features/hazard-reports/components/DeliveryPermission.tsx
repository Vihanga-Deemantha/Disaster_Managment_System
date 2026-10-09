import { useState } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { DeliveryPermissionResult } from '../adapters/ExpoSyncNotifier';

/** Permission requests always have a visible result, including when Android shows no dialog. */
export function DeliveryPermission({
  enable,
  busy,
}: {
  enable?: () => Promise<DeliveryPermissionResult>;
  busy: boolean;
}) {
  const t = useT();
  const [result, setResult] = useState<DeliveryPermissionResult>();
  const [requesting, setRequesting] = useState(false);
  async function request(): Promise<void> {
    if (!enable) return;
    setRequesting(true);
    try {
      setResult(await enable());
    } catch {
      setResult('UNAVAILABLE');
    } finally {
      setRequesting(false);
    }
  }
  if (!enable) return null;
  return (
    <>
      <Banner tone={result === 'GRANTED' ? 'success' : 'info'}>
        {result ? t(`reports.notifications.${result}`) : t('reports.notificationsReason')}
      </Banner>
      {result !== 'GRANTED' && (
        <Button
          title={t('reports.enableNotifications')}
          variant="secondary"
          onPress={() => {
            void request();
          }}
          disabled={busy}
          loading={requesting}
        />
      )}
    </>
  );
}
