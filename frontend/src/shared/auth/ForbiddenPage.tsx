import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';

export function ForbiddenPage() {
  const t = useT();
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-navy-900">{t('forbidden.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('forbidden.body')}</p>
      <Link to="/" className="mt-6 inline-block font-semibold text-accent-700 underline">
        {t('common.goHome')}
      </Link>
    </section>
  );
}
