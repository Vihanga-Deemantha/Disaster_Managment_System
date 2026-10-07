import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { Spinner } from '@/shared/ui/Spinner';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { homePathFor } from './homePath';
import { SignInForm } from './SignInForm';

/** Where to go after signing in: back to what the person asked for, else their home screen. */
function destination(state: unknown, fallback: string): string {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from && from !== '/login' ? from : fallback;
}

export function LoginPage() {
  const t = useT();
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('auth.login.title')} · ${t('app.name')}`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 text-white">
        <Spinner />
      </div>
    );
  }
  if (status === 'authenticated' && user) {
    return <Navigate to={destination(location.state, homePathFor(user.role))} replace />;
  }

  return (
    <AuthLayout title={t('auth.login.title')}>
      <SignInForm
        onSignedIn={(signedIn) =>
          navigate(destination(location.state, homePathFor(signedIn.role)), { replace: true })
        }
      />
      <p className="mt-6 text-center text-sm text-ink-soft">
        {t('auth.login.registerPrompt')}{' '}
        <Link to="/register" className="font-semibold text-accent-700 underline">
          {t('auth.login.registerLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
