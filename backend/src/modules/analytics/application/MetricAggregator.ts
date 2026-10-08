import { CHANNELS } from '@shared/contracts/enums';
import type { AlertFact, DispatchFact, ImpactMetrics, OccupancyFact } from '../domain/types';

export interface MetricAggregator<T, R> {
  aggregate(facts: T[]): R;
}
const percentage = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 10000) / 100;

/** UC-4 BR2: recipients delivered on at least one channel, never channel deliveries summed. */
export class AlertReachAggregator implements MetricAggregator<
  AlertFact,
  Pick<ImpactMetrics, 'alertTimeline' | 'byChannel'>
> {
  aggregate(facts: AlertFact[]) {
    const days = new Map<
      string,
      { date: string; alerts: number; targeted: number; reached: number; reachPct: number }
    >();
    for (const fact of facts) {
      const date = fact.at.slice(0, 10);
      const row = days.get(date) ?? { date, alerts: 0, targeted: 0, reached: 0, reachPct: 0 };
      row.alerts++;
      row.targeted += fact.targeted;
      row.reached += fact.reached;
      row.reachPct = percentage(row.reached, row.targeted);
      days.set(date, row);
    }
    return {
      alertTimeline: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byChannel: CHANNELS.map((channel) => ({
        channel,
        sent: facts.reduce((s, f) => s + f.byChannel[channel].sent, 0),
        delivered: facts.reduce((s, f) => s + f.byChannel[channel].delivered, 0),
        failed: facts.reduce((s, f) => s + f.byChannel[channel].failed, 0),
      })),
    };
  }
}
/** UC-4 step 7: daily snapshots use the last observation of each shelter that day. */
export class OccupancyAggregator implements MetricAggregator<
  OccupancyFact,
  ImpactMetrics['occupancySeries']
> {
  aggregate(facts: OccupancyFact[]) {
    const snapshots = new Map<string, OccupancyFact>();
    for (const fact of [...facts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
      snapshots.set(`${fact.at.slice(0, 10)}:${fact.shelterId}`, fact);
    const days = new Map<string, { date: string; occupancy: number; capacity: number }>();
    for (const fact of snapshots.values()) {
      const date = fact.at.slice(0, 10);
      const row = days.get(date) ?? { date, occupancy: 0, capacity: 0 };
      row.occupancy += fact.occupancy;
      row.capacity += fact.capacity;
      days.set(date, row);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
/** UC-4 HCI-10: units remain separate; rounded organisation shares total exactly 100 per unit. */
export class DistributionAggregator implements MetricAggregator<
  DispatchFact,
  Pick<ImpactMetrics, 'distributionByDistrict' | 'distributionByOrganisation'>
> {
  aggregate(facts: DispatchFact[]) {
    const districts = new Map<string, ImpactMetrics['distributionByDistrict'][number]>();
    const orgs = new Map<string, ImpactMetrics['distributionByOrganisation'][number]>();
    for (const fact of facts) {
      const key = `${fact.organizationId}:${fact.unit}`;
      const org = orgs.get(key) ?? {
        organizationId: fact.organizationId,
        organizationName: fact.organizationName,
        unit: fact.unit,
        quantity: 0,
        sharePct: 0,
      };
      org.quantity += fact.quantity;
      orgs.set(key, org);
      const dkey = `${fact.district}:${key}`;
      const row = districts.get(dkey) ?? {
        district: fact.district,
        unit: fact.unit,
        organizationId: fact.organizationId,
        organizationName: fact.organizationName,
        quantity: 0,
      };
      row.quantity += fact.quantity;
      districts.set(dkey, row);
    }
    const values = [...orgs.values()];
    this.assignShares(values);
    return { distributionByDistrict: [...districts.values()], distributionByOrganisation: values };
  }
  private assignShares(values: ImpactMetrics['distributionByOrganisation']) {
    for (const unit of new Set(values.map((o) => o.unit))) {
      const group = values.filter((o) => o.unit === unit);
      const total = group.reduce((s, o) => s + o.quantity, 0);
      let assigned = 0;
      group.forEach((org, index) => {
        org.sharePct =
          total === 0
            ? 0
            : index === group.length - 1
              ? Math.round((100 - assigned) * 100) / 100
              : percentage(org.quantity, total);
        assigned += org.sharePct;
      });
    }
  }
}
export function assembleMetrics(
  alerts: AlertFact[],
  occupancy: OccupancyFact[],
  distribution: DispatchFact[],
): ImpactMetrics {
  const reach = new AlertReachAggregator().aggregate(alerts);
  const occupancySeries = new OccupancyAggregator().aggregate(occupancy);
  const relief = new DistributionAggregator().aggregate(distribution);
  const units = new Map<string, number>();
  distribution.forEach((f) => units.set(f.unit, (units.get(f.unit) ?? 0) + f.quantity));
  return {
    ...reach,
    ...relief,
    occupancySeries,
    allocations: distribution,
    totals: {
      alertsIssued: alerts.length,
      reachPct: percentage(
        alerts.reduce((s, f) => s + f.reached, 0),
        alerts.reduce((s, f) => s + f.targeted, 0),
      ),
      peakOccupancy: Math.max(0, ...occupancySeries.map((f) => f.occupancy)),
      reliefDistributed: [...units].map(([unit, quantity]) => ({ unit, quantity })),
    },
    recordCount: alerts.length + occupancy.length + distribution.length,
  };
}
