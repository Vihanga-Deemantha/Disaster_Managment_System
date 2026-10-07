import { Navigate } from 'react-router';
import { useAuth } from '@/shared/auth/AuthContext';
import { homePathFor } from '@/shared/auth/homePath';
import { useT } from '@/shared/i18n/I18nProvider';
import { useDocumentTitle } from '@/shared/layout/useDocumentTitle';
import { ScreenSpinner } from '@/shared/ui/ScreenSpinner';
import { AboutSection } from './AboutSection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { ServicesSection } from './ServicesSection';

/**
 * The public front door at `/`. Someone who is already signed in has no use for it, so they go
 * straight to the screen their role works in; everyone else sees what Safe Zone is and how to join.
 */
export function LandingPage() {
  const t = useT();
  const { status, user } = useAuth();
  useDocumentTitle(`${t('app.name')} · ${t('app.tagline')}`);

  if (status === 'loading') return <ScreenSpinner />;
  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user.role)} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-navy-900"
      >
        {t('shell.skipToContent')}
      </a>
      <LandingHeader />
      <main id="main" tabIndex={-1} className="focus-visible:outline-none">
        <LandingHero />
        <ServicesSection />
        <AboutSection />
      </main>
      <LandingFooter />
    </div>
  );
}
