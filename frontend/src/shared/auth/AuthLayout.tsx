import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/I18nProvider';
import { LanguageSwitcher } from '@/shared/i18n/LanguageSwitcher';

/** The shared frame for sign-in and registration: brand on navy, a card for the form. Mobile first. */
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="min-h-screen bg-navy-900">
      <header className="flex items-center justify-between px-4 py-4 text-white md:px-8">
        <div>
          <p className="text-xl font-bold">{t('app.name')}</p>
          <p className="text-xs text-accent-100">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher tone="dark" />
      </header>
      <main id="main" className="mx-auto w-full max-w-xl px-4 pb-12">
        <div className="rounded-lg bg-card p-6 shadow-xl md:p-8">
          <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
          {intro ? <p className="mt-2 text-sm text-ink-soft">{intro}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
