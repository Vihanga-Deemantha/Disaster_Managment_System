import { UserModel } from '@shared/auth/infrastructure/models';
import {
  HazardReportModel,
  ReportClusterModel,
} from '../../modules/hazard-reports/infrastructure/models';
import { AlertNotificationModel, WarningModel } from '../../modules/warnings/infrastructure/models';
import type { AccountsSummary } from './accounts';
import type { AnalyticsHistory } from './analytics';
import type { HazardHistory } from './hazardReports';
import type { ResourceHistory } from './resources';
import type { WarningHistory } from './warnings';
import type { DemoWorld } from './world';

type Counts = Record<string, number>;

interface Countable {
  collection: {
    aggregate(pipeline: object[]): { toArray(): Promise<Record<string, unknown>[]> };
  };
}

async function countBy(model: Countable, field: string): Promise<Counts> {
  const rows = await model.collection
    .aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((row) => [String(row._id), Number(row.n)]));
}

function tally<T>(items: readonly T[], key: (item: T) => string): Counts {
  const counts: Counts = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** What the database holds now, by state: the proof that every state of every use case is present. */
export interface DatabaseCounts {
  users: Counts;
  warnings: Counts;
  notifications: Counts;
  reports: Counts;
  clusters: Counts;
  requests: Counts;
  dispatches: Counts;
  analyticsEvents: number;
  exports: number;
}

export async function countDatabase(world: DemoWorld): Promise<DatabaseCounts> {
  const { store } = world.resources;
  return {
    users: await countBy(UserModel, 'role'),
    warnings: await countBy(WarningModel, 'status'),
    notifications: await countBy(AlertNotificationModel, 'overallStatus'),
    reports: await countBy(HazardReportModel, 'status'),
    clusters: await countBy(ReportClusterModel, 'status'),
    requests: tally(await store.list('requests'), (request) => request.status),
    dispatches: tally(await store.list('dispatches'), (dispatch) => dispatch.status),
    analyticsEvents: (await world.analytics.store.list()).length,
    exports: (await world.analytics.store.reports()).length,
  };
}

export interface DemoSeedSummary {
  alreadySeeded: boolean;
  accounts?: AccountsSummary;
  hazards?: Omit<HazardHistory, 'stories'>;
  warnings?: WarningHistory;
  resources?: ResourceHistory;
  analytics?: AnalyticsHistory;
  database?: DatabaseCounts;
}

const list = (counts: Counts): string =>
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name} ${count}`)
    .join(', ');

/** The lines printed at the end of `npm run seed:demo`. */
export function describeSummary(summary: DemoSeedSummary): string[] {
  if (summary.alreadySeeded || !summary.database) {
    return [
      'The demo scenarios are already in this database. Nothing was added.',
      'To rebuild everything from scratch: npm run seed:demo -- --fresh',
    ];
  }
  const { database: db, hazards, warnings, resources, analytics } = summary;
  return [
    'Demo data is ready.',
    `  People:        ${list(db.users)}`,
    `  UC-1 warnings: ${list(db.warnings)} (${warnings?.issued.length ?? 0} issued with delivery history)`,
    `  UC-1 alerts:   ${list(db.notifications)}`,
    `  UC-3 reports:  ${list(db.reports)} (${hazards?.photos ?? 0} with a photo)`,
    `  UC-3 clusters: ${list(db.clusters)}`,
    `  UC-2 requests: ${list(db.requests)}`,
    `  UC-2 supplies: ${list(db.dispatches)} (${resources?.occupancyReports ?? 0} shelter occupancy reports)`,
    `  UC-4 history:  ${db.analyticsEvents} events, ${db.exports} saved exports (${analytics?.failedExports ?? 0} failed)`,
    'Sign in with the demo logins in the README; the walk-through is docs/demo-data.md.',
  ];
}
