import { useT } from '@/shared/i18n/I18nProvider';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { useAuth } from './AuthContext';
import { SignInForm } from './SignInForm';

/**
 * Shown over whatever the person was doing when their session ends (master plan §7.1.8). Signing in
 * again closes it and the offline outbox is flushed, so nothing queued is lost.
 */
export function SessionExpiredDialog() {
  const t = useT();
  const { sessionExpired, user, logout } = useAuth();
  return (
    <Dialog
      open={sessionExpired}
      title={t('session.expiredTitle')}
      dismissible={false}
      onClose={() => undefined}
      footer={
        <Button variant="ghost" onClick={() => void logout()}>
          {t('shell.signOut')}
        </Button>
      }
    >
      <p>{t('session.expiredBody')}</p>
      <SignInForm defaultIdentifier={user?.email ?? user?.phone ?? ''} />
    </Dialog>
  );
}
