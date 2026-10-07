import { useT } from '@/shared/i18n/I18nProvider';

/**
 * What a use case shows until its owner replaces `features/<name>/index.tsx` with the real screens.
 * Delete the import in your `index.tsx` once you have your own page.
 */
export function ModulePlaceholder({ title }: { title: string }) {
  const t = useT();
  return (
    <section>
      <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
      <p className="mt-2 text-ink-soft">{t('placeholder.body')}</p>
    </section>
  );
}
