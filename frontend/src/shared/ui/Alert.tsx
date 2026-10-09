import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { box: string; prefix: string; icon: IconName }> = {
  info: { box: 'bg-info-100 text-info-600', prefix: 'Info', icon: 'info' },
  success: { box: 'bg-success-100 text-success-600', prefix: 'Success', icon: 'checkCircle' },
  warning: { box: 'bg-warning-100 text-warning-600', prefix: 'Warning', icon: 'alertTriangle' },
  danger: { box: 'bg-danger-100 text-danger-600', prefix: 'Error', icon: 'alertCircle' },
};

/** Danger and warning interrupt screen readers (`role="alert"`); info and success are polite. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const urgent = tone === 'danger' || tone === 'warning';
  const { box, prefix, icon } = TONES[tone];
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-sm leading-normal ${box}`}
    >
      <Icon name={icon} size={17} strokeWidth={2.2} className="mt-px flex-none" />
      <div className="min-w-0">
        <span className="sr-only">{prefix}: </span>
        {children}
      </div>
    </div>
  );
}
