import { useT } from '@/shared/i18n/I18nProvider';
import { PageHeader } from '@/shared/ui/PageHeader';

/**
 * What a use case shows until its owner replaces `features/<name>/index.tsx` with the real screens.
 * Delete the import in your `index.tsx` once you have your own page. Build your screens from the shared
 * `PageHeader`, `StatCard`, `Card` and `SeverityPill` so they look like the rest of the app.
 */
export function ModulePlaceholder({ title }: { title: string }) {
  const t = useT();
  return (
    <section>
      <PageHeader title={title} subtitle={t('placeholder.body')} />
    </section>
  );
}
