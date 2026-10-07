import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/shared/auth/AuthContext';
import { SessionExpiredDialog } from '@/shared/auth/SessionExpiredDialog';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { LanguageSwitcher } from '@/shared/i18n/LanguageSwitcher';
import { OfflineBanner } from '@/shared/offline/OfflineBanner';
import { useOutboxRows } from '@/shared/offline/SyncProvider';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { visibleGroups, type NavGroup } from './navigation';

const LINK_BASE = 'block rounded-md px-3 py-2 text-sm font-medium';

function Sidebar({ groups, open }: { groups: NavGroup[]; open: boolean }) {
  const { t } = useI18n();
  return (
    <aside
      id="sidebar"
      className={`${open ? 'block' : 'hidden'} w-full shrink-0 bg-navy-900 text-white md:block md:w-64`}
    >
      <div className="px-5 py-5">
        <p className="text-xl font-bold">{t('app.name')}</p>
        <p className="text-xs text-accent-100">{t('app.tagline')}</p>
      </div>
      <nav aria-label={t('shell.navigation')} className="space-y-5 px-3 pb-6">
        {groups.map((group) => (
          <div key={group.id}>
            <h2 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-accent-400">
              {t(group.labelKey)}
            </h2>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `${LINK_BASE} ${isActive ? 'bg-accent-600 text-white' : 'text-navy-100 hover:bg-navy-700'}`
                    }
                  >
                    {t(item.labelKey)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SignOutGuard({
  open,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      title={t('shell.signOutQueuedTitle')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('shell.stayIn')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('shell.signOutAnyway')}
          </Button>
        </>
      }
    >
      <p>{t('shell.signOutQueuedBody', { count })}</p>
    </Dialog>
  );
}

/**
 * The one frame every module renders inside: a single sidebar, the signed-in user, the language
 * switch, the offline banner and a skip link (HCI-01). Pages render into the `<Outlet/>`.
 */
export function AppShell({ navGroups }: { navGroups: readonly NavGroup[] }) {
  const { t } = useI18n();
  const { user, logout, queueDiscarded, dismissQueueDiscarded } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const waiting = useOutboxRows(user?.userId).length;

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!user) return null;
  const groups = visibleGroups(navGroups, user.role);
  const signOut = (): void => {
    setConfirmingSignOut(false);
    void logout();
  };

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-3 py-2 text-navy-900 focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        {t('shell.skipToContent')}
      </a>
      <Sidebar groups={groups} open={menuOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-navy-800 px-4 py-3 text-white">
          <button
            type="button"
            className="min-h-11 rounded-md border border-navy-600 px-3 text-sm md:hidden"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? t('shell.closeMenu') : t('shell.openMenu')}
          </button>
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold">{user.displayName}</p>
            <p className="text-xs text-accent-100">{t(`role.${user.role}`)}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher tone="dark" />
            <Button
              variant="secondary"
              onClick={() => (waiting > 0 ? setConfirmingSignOut(true) : signOut())}
            >
              {t('shell.signOut')}
            </Button>
          </div>
        </header>
        <OfflineBanner />
        {queueDiscarded ? (
          <div className="p-4 pb-0">
            <Alert tone="warning">
              {t('session.queueDiscarded')}{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={dismissQueueDiscarded}
              >
                {t('common.close')}
              </button>
            </Alert>
          </div>
        ) : null}
        <main id="main" tabIndex={-1} className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <SessionExpiredDialog />
      <SignOutGuard
        open={confirmingSignOut}
        count={waiting}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={signOut}
      />
    </div>
  );
}
