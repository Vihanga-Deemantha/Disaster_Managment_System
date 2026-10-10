import { StatCard as SharedStatCard, type StatTone } from '@/shared/ui/StatCard';
import type { IconName } from '@/shared/ui/Icon';

export function StatCard({
  label,
  value,
  icon = 'fileText',
  tone = 'blue',
}: {
  label: string;
  value: number;
  icon?: IconName;
  tone?: StatTone;
}) {
  return <SharedStatCard label={label} value={String(value)} icon={icon} tone={tone} />;
}
