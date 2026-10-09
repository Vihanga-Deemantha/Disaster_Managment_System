import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { buttonClasses } from '@/shared/ui/Button';
import { ScreenSpinner } from '@/shared/ui/ScreenSpinner';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { homePathFor } from './homePath';
import { SignInForm } from './SignInForm';

/** Where to go after signing in: back to what the person asked for, else their home screen. */
function destination(state: unknown, fallback: string): string {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from && from !== '/login' ? from : fallback;
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 text-[13px] text-ink-soft">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

export function LoginPage() {
  const t = useT();
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useDocumentTitle(`${t('auth.login.title')} · ${t('app.name')}`);

  if (status === 'loading') return <ScreenSpinner />;
  if (status === 'authenticated' && user) {
    return <Navigate to={destination(location.state, homePathFor(user.role))} replace />;
  }

  return (
    <AuthLayout variant="signIn">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.02em] break-words text-navy-900">
          {t('auth.login.title')}
        </h1>
        <p className="text-[15px] leading-[1.6] text-ink-soft">{t('auth.login.intro')}</p>
      </div>
      <SignInForm
        onSignedIn={(signedIn) =>
          navigate(destination(location.state, homePathFor(signedIn.role)), { replace: true })
        }
      />
      <Divider>{t('auth.login.registerPrompt')}</Divider>
      <Link to="/register" className={buttonClasses('secondary', 'lg', 'w-full')}>
        {t('auth.login.registerLink')}
      </Link>
      <p className="text-center text-[13px] leading-[1.6] text-ink-soft">
        {t('auth.login.officerNote')}
      </p>
    </AuthLayout>
  );
}
