import { Linking } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import {
  useNotificationPermission,
  type PermissionGateway,
} from '../hooks/useNotificationPermission';

/**
 * Asks, in one line and at the moment it matters, for the permission that lets a warning pop up on
 * the phone. It disappears once allowed; when the phone will not ask again it points to the settings.
 */
export function NotificationPrompt({ permissions }: { permissions: PermissionGateway }) {
  const t = useT();
  const { status, request } = useNotificationPermission(permissions);
  // Nothing to ask for when it is already allowed, or where notifications cannot exist at all.
  if (status === 'checking' || status === 'granted' || status === 'unsupported') return null;
  if (status === 'denied') {
    return (
      <Banner
        tone="warning"
        action={
          <Button
            title={t('alerts.notify.openSettings')}
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        }
      >
        {t('alerts.notify.blocked')}
      </Banner>
    );
  }
  return (
    <Banner
      tone="info"
      action={<Button title={t('alerts.notify.enable')} onPress={() => void request()} />}
    >
      {`${t('alerts.notify.title')}. ${t('alerts.notify.body')}`}
    </Banner>
  );
}
