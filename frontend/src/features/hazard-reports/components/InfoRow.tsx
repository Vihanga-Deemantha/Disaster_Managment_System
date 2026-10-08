import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/shared/ui/Icon';

/** The same labelled information layout used by the warning review screen. */
export function InfoRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="min-w-0 break-words text-ink-soft">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2.5 font-medium text-navy-900">
        <Icon name={icon} size={16} className="flex-none text-ink-soft" />
        <div className="min-w-0 break-words">{children}</div>
      </dd>
    </>
  );
}
