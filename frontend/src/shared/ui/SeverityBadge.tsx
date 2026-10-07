import type { Severity } from '@contracts/enums';

const STYLES: Record<Severity, { label: string; classes: string }> = {
  LOW: { label: 'Low', classes: 'bg-sev-low text-white' },
  MEDIUM: { label: 'Medium', classes: 'bg-sev-medium text-white' },
  HIGH: { label: 'High', classes: 'bg-sev-high text-white' },
  CRITICAL: { label: 'Critical', classes: 'bg-sev-critical text-white' },
};

/** Severity is always colour AND text, never colour alone (accessibility rule, master plan §11). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, classes } = STYLES[severity];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase ${classes}`}
    >
      {label}
    </span>
  );
}
