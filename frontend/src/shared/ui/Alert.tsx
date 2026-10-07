import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { box: string; prefix: string }> = {
  info: { box: 'border-info-600 bg-info-100 text-info-600', prefix: 'Info' },
  success: { box: 'border-success-600 bg-success-100 text-success-600', prefix: 'Success' },
  warning: { box: 'border-warning-600 bg-warning-100 text-warning-600', prefix: 'Warning' },
  danger: { box: 'border-danger-600 bg-danger-100 text-danger-600', prefix: 'Error' },
};

/** Danger and warning interrupt screen readers (`role="alert"`); info and success are polite. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`rounded-md border-l-4 px-4 py-3 text-sm ${TONES[tone].box}`}
    >
      <span className="sr-only">{TONES[tone].prefix}: </span>
      {children}
    </div>
  );
}
