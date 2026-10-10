import type { Severity } from '@contracts/enums';
import { useT } from '@/shared/i18n/I18nProvider';

/**
 * Soft pill colours (high is pink with red text, medium amber, low blue); a critical warning is a solid
 * red, so it can never be mistaken for a high one.
 */
const STYLES: Record<Severity, string> = {
  LOW: 'bg-info-100 text-info-600',
  MEDIUM: 'bg-warning-100 text-warning-600',
  HIGH: 'bg-danger-100 text-danger-600',
  CRITICAL: 'bg-danger-600 text-white',
};

/** Severity in words, in the reader's language, and colour: never colour alone (accessibility rule). */
export function SeverityPill({ severity }: { severity: Severity }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center rounded-lg px-3 py-1 text-[13px] font-bold ${STYLES[severity]}`}
    >
      {t(`severity.${severity}`)}
    </span>
  );
}
