import { useT } from '@/shared/i18n/I18nProvider';

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-8 w-8 border-4' };

/** A loading indicator that screen readers announce, in the user's language. */
export function Spinner({ size = 'md', label }: { size?: keyof typeof SIZES; label?: string }) {
  const t = useT();
  return (
    <span role="status" className="inline-flex items-center">
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-current border-t-transparent ${SIZES[size]}`}
      />
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
  );
}
