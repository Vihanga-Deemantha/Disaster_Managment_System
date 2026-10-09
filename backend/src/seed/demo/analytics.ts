import type { AnalyticsStore } from '../../modules/analytics/application/ports';
import type {
  AlertFact,
  CatalogEvent,
  DispatchFact,
  ExportOptions,
  FilterInput,
  OccupancyFact,
  ReportMetadata,
} from '../../modules/analytics/domain/types';
import type { AnalyticsFilter } from '../../modules/analytics/domain/AnalyticsFilter';
import type { Actor, DemoWorld } from './world';

/**
 * UC-4 on top of what the base seed already holds (six months of history in ten districts): the export
 * history of three organisations, made by the real export code (a real PDF or CSV is rendered, its
 * SHA-256 recorded), plus one export that failed. The alerts and relief that the other stories produced
 * reached the analytics store by themselves, through the same events the running API uses.
 */

const day = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Writes to the analytics store a few dozen at a time instead of one after another. The base seed makes
 * thousands of small writes; over a cloud database each waits for its answer, so one at a time takes
 * minutes. Every write is an upsert on a fixed key, so the order does not matter.
 */
export class ParallelAnalyticsStore implements AnalyticsStore {
  private readonly running = new Set<Promise<void>>();
  private failure: unknown;

  constructor(
    private readonly inner: AnalyticsStore,
    private readonly limit = 48,
  ) {}

  private async start(write: () => Promise<void>): Promise<void> {
    while (this.running.size >= this.limit) await Promise.race(this.running);
    const task: Promise<void> = write()
      .catch((error: unknown) => {
        this.failure ??= error;
      })
      .finally(() => {
        this.running.delete(task);
      });
    this.running.add(task);
  }

  /** Waits for every write still on its way, and throws the first one that failed. */
  async drain(): Promise<void> {
    await Promise.all(this.running);
    if (this.failure) throw this.failure;
  }

  putEvent(event: CatalogEvent): Promise<void> {
    return this.start(() => this.inner.putEvent(event));
  }
  putAlert(fact: AlertFact): Promise<void> {
    return this.start(() => this.inner.putAlert(fact));
  }
  putOccupancy(fact: OccupancyFact): Promise<void> {
    return this.start(() => this.inner.putOccupancy(fact));
  }
  putDispatch(fact: DispatchFact): Promise<void> {
    return this.start(() => this.inner.putDispatch(fact));
  }
  saveReport(report: ReportMetadata): Promise<void> {
    return this.inner.saveReport(report);
  }
  reports(ownerId?: string): Promise<ReportMetadata[]> {
    return this.inner.reports(ownerId);
  }
  list(): Promise<CatalogEvent[]> {
    return this.inner.list();
  }
  countReach(filter: AnalyticsFilter): Promise<AlertFact[]> {
    return this.inner.countReach(filter);
  }
  occupancySeries(filter: AnalyticsFilter): Promise<OccupancyFact[]> {
    return this.inner.occupancySeries(filter);
  }
  distributionByDistrict(filter: AnalyticsFilter): Promise<DispatchFact[]> {
    return this.inner.distributionByDistrict(filter);
  }
}

interface ExportSpec {
  by: 'dmc1' | 'ngo' | 'donor';
  /** Minutes before the seed started. */
  ago: number;
  options: ExportOptions;
  /** A district's event of last month, or the whole month for every district. */
  scope: 'ratnapura-event' | 'last-month';
}

const EXPORTS: readonly ExportSpec[] = [
  {
    by: 'dmc1',
    ago: 4 * 60,
    scope: 'ratnapura-event',
    options: {
      format: 'PDF',
      audience: 'INTERNAL',
      datasets: ['alerts', 'occupancy', 'distribution'],
    },
  },
  {
    by: 'ngo',
    ago: 3 * 60,
    scope: 'last-month',
    options: { format: 'CSV', audience: 'EXTERNAL', datasets: ['distribution'] },
  },
  {
    by: 'donor',
    ago: 90,
    scope: 'last-month',
    options: {
      format: 'PDF',
      audience: 'EXTERNAL',
      datasets: ['alerts', 'occupancy', 'distribution'],
    },
  },
];

/** Last calendar month, which the base seed fills for every district. */
function lastMonth(now: Date): { from: string; to: string; month: string } {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: day(first), to: day(last), month: first.toISOString().slice(0, 7) };
}

function filterOf(spec: ExportSpec, now: Date): FilterInput {
  const { from, to, month } = lastMonth(now);
  return spec.scope === 'ratnapura-event'
    ? { eventId: `ratnapura-${month}`, district: 'RATNAPURA', hazardType: 'FLOOD', from, to }
    : { district: 'ALL', hazardType: 'ALL', from, to };
}

export interface AnalyticsHistory {
  exports: number;
  failedExports: number;
}

export async function seedAnalyticsHistory(world: DemoWorld): Promise<AnalyticsHistory> {
  const { controller, store } = world.analytics;
  for (const spec of EXPORTS) {
    world.travelTo(spec.ago);
    const actor: Actor = world.actors[spec.by];
    await controller.generateImpactReport(
      filterOf(spec, world.startedAt),
      spec.options,
      actor.auth,
    );
  }
  // One export that could not be produced even after the automatic retry (UC-4 BR5): the history keeps it.
  const failedAt = world.travelTo(26 * 60);
  await store.saveReport({
    reportId: world.ids.next(),
    filter: filterOf(EXPORTS[2] as ExportSpec, world.startedAt),
    options: {
      format: 'PDF',
      audience: 'EXTERNAL',
      datasets: ['alerts', 'occupancy', 'distribution'],
    },
    generatedBy: world.actors.ngo.user.userId,
    generatedAt: failedAt.toISOString(),
    status: 'FAILED',
    attempts: 2,
  });
  return { exports: EXPORTS.length, failedExports: 1 };
}
