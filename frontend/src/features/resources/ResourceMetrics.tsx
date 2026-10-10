import { AlertTriangle, Clock3, MapPin, PackageCheck, Truck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { districtMetrics } from './pipeline';
import { Badge } from './ResourceUI';
import type { Board } from './types';

export function ResourceMetrics({ board }: { board: Board }) {
  const m = districtMetrics(board);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Active affected areas" value={board.areas.length} icon={MapPin} tone="indigo">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="rose" icon={AlertTriangle}>
            {m.critical} critical
          </Badge>
          <Badge tone="amber" icon={AlertTriangle}>
            {m.high} high
          </Badge>
        </div>
      </Metric>
      <Metric title="Outstanding needs" value={m.shortages} icon={PackageCheck} tone="rose">
        <p className="text-xs text-ink-soft">Unallocated requirement gaps</p>
        <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
          <span>Delivered fulfillment</span>
          <strong>{m.fulfillment}%</strong>
        </div>
        <progress
          aria-label="Delivered fulfillment"
          max={100}
          value={m.fulfillment}
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line-soft [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500"
        />
      </Metric>
      <Metric title="Awaiting owners" value={m.pending} icon={Clock3} tone="amber">
        <p className="text-xs text-ink-soft">Owner response due in 30 minutes</p>
      </Metric>
      <Metric title="Active deliveries" value={m.active + m.deployed} icon={Truck} tone="indigo">
        <p className="text-xs text-ink-soft">
          {m.active} in transit / delayed · {m.deployed} deployed
        </p>
      </Metric>
    </div>
  );
}
function Metric({
  title,
  value,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  children: ReactNode;
}) {
  const color =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-600'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-600'
        : 'bg-accent-50 text-accent-600';
  return (
    <div className="rounded-xl border border-line-soft bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold leading-4 text-ink-soft">{title}</p>
        <span className={`rounded-lg p-1.5 ${color}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <p className="my-2 text-2xl font-bold tracking-tight text-navy-900">{value}</p>
      {children}
    </div>
  );
}
