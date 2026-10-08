import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import type { MeResponse } from '@contracts/auth';
import { useAuth } from '@/shared/auth/AuthContext';
import { SessionExpiredDialog } from '@/shared/auth/SessionExpiredDialog';
import { DATE_LOCALE, useI18n } from '@/shared/i18n/I18nProvider';
import { LanguageSwitcher } from '@/shared/i18n/LanguageSwitcher';
import { OfflineBanner } from '@/shared/offline/OfflineBanner';
import { useOutboxRows } from '@/shared/offline/SyncProvider';
import { useOnlineStatus } from '@/shared/offline/useOnlineStatus';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Icon } from '@/shared/ui/Icon';
import { activeNavItem, visibleGroups, type NavGroup, type NavItem } from './navigation';

/** "DMC Officer (demo)" becomes "DO": the first letters of the first two words, for the round avatar. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * One sidebar entry. A waiting count is drawn as a round badge; a screen reader hears it as the link's
 * description ("3 waiting") instead of as part of its name, so the name stays "Pending Approvals".
 */
function NavLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  const { t } = useI18n();
  const noteId = useId();
  return (
    <li>
      <Link
        to={item.to}
        aria-current={active ? 'page' : undefined}
        aria-describedby={count ? noteId : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-[14px] font-semibold transition-colors ${
          active
            ? 'border-accent-400/70 bg-accent-600/40 text-white'
            : 'border-transparent text-navy-100 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Icon
          name={item.icon ?? 'dot'}
          size={18}
          className={active ? 'text-accent-400' : 'text-navy-100/70'}
        />
        <span className="flex-1">{t(item.labelKey)}</span>
        {count ? (
          <span
            aria-hidden="true"
            className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-400 px-1.5 text-xs font-extrabold text-navy-900"
          >
            {count}
          </span>
        ) : null}
      </Link>
      {count ? (
        <span id={noteId} className="sr-only">
          {t('shell.badgeCount', { count })}
        </span>
      ) : null}
    </li>
  );
}

/** An entry whose number comes from the feature's own hook (nothing is drawn for zero or while unknown). */
function BadgedNavLink({
  item,
  active,
  useBadge,
}: {
  item: NavItem;
  active: boolean;
  useBadge: () => number | undefined;
}) {
  return <NavLink item={item} active={active} count={useBadge()} />;
}

function NavEntry({ item, active }: { item: NavItem; active: boolean }) {
  return item.useBadge ? (
    <BadgedNavLink item={item} active={active} useBadge={item.useBadge} />
  ) : (
    <NavLink item={item} active={active} />
  );
}

function Brand({ role }: { role: MeResponse['role'] }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-5 pb-5 pt-6">
      <span className="text-accent-400">
        <Icon name="shieldAlert" size={30} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[17px] font-extrabold leading-tight">{t('app.name')}</p>
        <p className="text-[11px] leading-snug break-words text-navy-100/70">
          {t('shell.console', { role: t(`role.${role}`) })}
        </p>
      </div>
    </div>
  );
}

/** Who is signed in, and the way out: pinned to the bottom of the sidebar. */
function UserBlock({ user, onSignOut }: { user: MeResponse; onSignOut: () => void }) {
  const { t } = useI18n();
  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-navy-700 text-[13px] font-bold text-accent-400"
        >
          {initialsOf(user.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-tight font-bold break-words">{user.displayName}</p>
          <p className="text-[11px] leading-snug break-words text-navy-100/70">
            {t(`role.${user.role}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          aria-label={t('shell.signOut')}
          title={t('shell.signOut')}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-navy-100 hover:bg-white/10 hover:text-white"
        >
          <Icon name="logOut" size={18} />
        </button>
      </div>
    </div>
  );
}

function Sidebar({
  groups,
  open,
  user,
  onSignOut,
}: {
  groups: NavGroup[];
  open: boolean;
  user: MeResponse;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const active = activeNavItem(
    groups.flatMap((group) => group.items),
    pathname,
  );
  return (
    <aside
      id="sidebar"
      className={`${open ? 'fixed inset-y-0 left-0 z-40 flex w-72 shadow-2xl' : 'hidden'} flex-col bg-navy-900 text-white md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-[248px] md:flex-none md:shadow-none`}
    >
      <Brand role={user.role} />
      <nav
        aria-label={t('shell.navigation')}
        className="flex-1 space-y-5 overflow-y-auto px-3 pb-4"
      >
        {groups.map((group) => (
          <div key={group.id}>
            <h2 className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-navy-100/60">
              {t(group.labelKey)}
            </h2>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <NavEntry key={item.id} item={item} active={item === active} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <UserBlock user={user} onSignOut={onSignOut} />
    </aside>
  );
}

/** Today's date and time, and whether the connection is up: what an officer glances at under pressure. */
function DateAndConnection() {
  const { language, t } = useI18n();
  const online = useOnlineStatus();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const locale = DATE_LOCALE[language];
  return (
    <div className="hidden text-right sm:block">
      <p className="text-sm font-bold text-navy-900">
        {now.toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      <p className="text-xs text-ink-soft">
        {now.toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })}
      </p>
      <p
        className={`flex items-center justify-end gap-1.5 text-xs font-semibold ${online ? 'text-success-600' : 'text-warning-600'}`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {online ? t('shell.online') : t('shell.offline')}
      </p>
    </div>
  );
}

/** The thin bar above every page: the phone's menu button, then the date and connection, then the language. */
function TopBar({
  menuOpen,
  buttonRef,
  onToggle,
}: {
  menuOpen: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4 md:justify-end md:px-8">
      <button
        ref={buttonRef}
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-navy-900 md:hidden"
        aria-label={menuOpen ? t('shell.closeMenu') : t('shell.openMenu')}
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onToggle}
      >
        <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
      </button>
      <div className="flex items-center gap-4">
        <DateAndConnection />
        <LanguageSwitcher />
      </div>
    </div>
  );
}

/** While `open`, pressing Escape calls `onClose`: how a keyboard user shuts the phone menu. */
function useCloseOnEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
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
 * The one frame every module renders inside: a dark sidebar with the signed-in person at the bottom, a
 * thin bar with the date, the connection and the language, the offline banner and a skip link (HCI-01).
 * On a phone the sidebar slides over the page from a menu button. Pages render into the `<Outlet/>`.
 */
export function AppShell({ navGroups }: { navGroups: readonly NavGroup[] }) {
  const { t } = useI18n();
  const { user, logout, queueDiscarded, dismissQueueDiscarded } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const waiting = useOutboxRows(user?.userId).length;

  /** Shuts the phone menu and hands the keyboard back to the button that opened it. */
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useCloseOnEscape(menuOpen, closeMenu);

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
      <Sidebar
        groups={groups}
        open={menuOpen}
        user={user}
        onSignOut={() => (waiting > 0 ? setConfirmingSignOut(true) : signOut())}
      />
      {menuOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-30 bg-navy-950/60 md:hidden"
          onClick={closeMenu}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          menuOpen={menuOpen}
          buttonRef={menuButton}
          onToggle={() => setMenuOpen((open) => !open)}
        />
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
        <main id="main" tabIndex={-1} className="flex-1 px-4 pb-10 pt-2 md:px-8">
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
