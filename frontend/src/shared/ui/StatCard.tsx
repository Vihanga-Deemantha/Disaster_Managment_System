import { useId } from 'react';
import { Icon, type IconName } from './Icon';

export type StatTone = 'amber' | 'red' | 'blue' | 'green';

/** Soft tile colours: each pairs a pale background with a dark glyph, so the icon is readable on it. */
const TONES: Record<StatTone, string> = {
  amber: 'bg-warning-100 text-warning-600',
  red: 'bg-danger-100 text-danger-600',
  blue: 'bg-info-100 text-info-600',
  green: 'bg-success-100 text-success-600',
};

/**
 * One headline number with a coloured icon tile, a label and a short note (the dashboard cards). The
 * tile is decoration; the number, its label and its note carry the meaning and are read out together.
 */
export function StatCard({
  icon,
  tone,
  value,
  label,
  note,
}: {
  icon: IconName;
  tone: StatTone;
  value: string;
  label: string;
  note?: string;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex items-center gap-3.5 rounded-2xl border border-line-soft bg-card p-4 shadow-[0_1px_2px_rgba(20,40,70,0.05)]"
    >
      <span
        className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${TONES[tone]}`}
      >
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-[26px] font-extrabold leading-none text-navy-900">{value}</p>
        <p id={labelId} className="mt-1.5 text-sm font-bold text-navy-900">
          {label}
        </p>
        {note ? <p className="text-xs text-ink-soft">{note}</p> : null}
      </div>
    </div>
  );
}
