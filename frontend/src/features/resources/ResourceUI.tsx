import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CircleDashed,
  MapPin,
  PackageCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Board, Need } from './types';
import { resourcePipeline } from './pipeline';

export const tones = {
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  indigo: 'border-accent-100 bg-accent-50 text-accent-700',
  slate: 'border-line-soft bg-line-soft text-ink-soft',
};
export function Badge({
  children,
  tone = 'slate',
  icon: Icon = CircleDashed,
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  icon?: LucideIcon;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}
const statuses: Record<string, { name: string; tone: keyof typeof tones; icon: LucideIcon }> = {
  PENDING: { name: 'Awaiting owner confirmation', tone: 'amber', icon: Clock3 },
  PENDING_OWNER_CONFIRMATION: { name: 'Awaiting owner confirmation', tone: 'amber', icon: Clock3 },
  DISPATCHED: { name: 'In transit · pending arrival', tone: 'amber', icon: Truck },
  DISTRIBUTION_PENDING: { name: 'Delivery delayed', tone: 'amber', icon: AlertTriangle },
  CONFIRMED: { name: 'Confirmed', tone: 'emerald', icon: CheckCircle2 },
  DEPLOYED: { name: 'Deployed / delivered', tone: 'emerald', icon: PackageCheck },
  DELIVERED: { name: 'Delivered', tone: 'emerald', icon: PackageCheck },
  REJECTED: { name: 'Declined', tone: 'rose', icon: XCircle },
  DECLINED: { name: 'Declined', tone: 'rose', icon: XCircle },
  NO_RESPONSE: { name: 'Expired · no response', tone: 'rose', icon: Clock3 },
  EXPIRED: { name: 'Expired', tone: 'rose', icon: Clock3 },
  REASSIGNED: { name: 'Reassigned', tone: 'indigo', icon: ArrowRight },
};
export function OperationalStatus({ status }: { status: string }) {
  const value = statuses[status] ?? {
    name: status.replaceAll('_', ' '),
    tone: 'slate' as const,
    icon: CircleDashed,
  };
  return (
    <Badge tone={value.tone} icon={value.icon}>
      {value.name}
    </Badge>
  );
}
export function PriorityBadge({ priority }: { priority: number }) {
  const name = priority === 1 ? 'Critical' : priority === 2 ? 'High' : 'Standard';
  return (
    <Badge
      tone={priority === 1 ? 'rose' : priority === 2 ? 'amber' : 'slate'}
      icon={AlertTriangle}
      title="Allocation rank: lower numbers are higher priority"
    >
      {name} · P{priority}
    </Badge>
  );
}
export function DistrictButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
export function EmptyState({
  title,
  detail,
  icon: Icon = MapPin,
}: {
  title: string;
  detail: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <Icon size={30} className="mx-auto mb-3 text-ink-soft/60" aria-hidden="true" />
      <h3 className="font-semibold text-navy-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{detail}</p>
    </div>
  );
}
export function RequirementPipeline({ need, board }: { need: Need; board: Board }) {
  const p = resourcePipeline(need, board);
  const segments = [
    { name: 'Delivered', value: p.delivered, color: 'bg-emerald-500' },
    { name: 'In transit / delayed', value: p.inTransit, color: 'bg-amber-400' },
    { name: 'Awaiting owner', value: p.awaitingOwner, color: 'bg-amber-200' },
    { name: 'Unallocated', value: p.unallocated, color: 'bg-rose-200' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs">
        <span className="text-ink-soft">
          Total required{' '}
          <strong className="text-navy-900">
            {p.required} {need.unit}
          </strong>
        </span>
        <span className="font-semibold text-emerald-700">
          {Math.round((p.delivered / Math.max(1, p.required)) * 100)}% delivered
        </span>
      </div>
      <div
        role="img"
        aria-label={segments.map((s) => `${s.name}: ${s.value} ${need.unit}`).join(', ')}
        className="flex h-2.5 overflow-hidden rounded-full bg-line-soft"
      >
        {segments.map((s) => (
          <span
            key={s.name}
            className={`${s.color} transition-all duration-500`}
            style={{ width: `${(s.value / Math.max(1, p.required)) * 100}%` }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {segments.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} />
            <dt className="text-ink-soft">{s.name}</dt>
            <dd className="ml-auto font-bold tabular-nums text-navy-900">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-soft">
        {p.unmet} {need.unit} still needed on site. Pending and in-transit supplies are not
        delivered.
      </p>
    </div>
  );
}
