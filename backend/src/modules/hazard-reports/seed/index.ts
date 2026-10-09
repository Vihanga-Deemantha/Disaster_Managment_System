import { DEMO_CITIZENS } from '@shared/auth/seed';
import type { District } from '@shared/contracts/enums';
import { normalizePhone } from '@shared/contracts/identity';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { SeedContext, SeedFunction } from '@shared/module';
import { DEFAULT_CLUSTERING_CONFIG as config } from '../domain/ClusteringConfig';
import { HazardReport } from '../domain/HazardReport';
import { WeightedPriorityScorer } from '../domain/PriorityScorer';
import { ReportCluster } from '../domain/ReportCluster';
import type { ReportHazardType } from '../domain/types';
import { MongoHazardReportRepository } from '../infrastructure/MongoHazardReportRepository';
import { MongoReportClusterRepository } from '../infrastructure/MongoReportClusterRepository';

interface DemoCluster {
  name: string;
  district: District;
  centre: GeoPoint;
  total: number;
  pending: number;
  newestMinutesAgo: number;
  hazardType: ReportHazardType;
}

const DEMO_CLUSTERS: readonly DemoCluster[] = [
  {
    name: 'kalutara',
    district: 'KALUTARA',
    centre: { lat: 6.5854, lng: 79.9607 },
    total: 14,
    pending: 10,
    newestMinutesAgo: 101,
    hazardType: 'FLOOD',
  },
  {
    name: 'ratnapura',
    district: 'RATNAPURA',
    centre: { lat: 6.6828, lng: 80.3992 },
    total: 9,
    pending: 8,
    newestMinutesAgo: 302,
    hazardType: 'FLOOD',
  },
  {
    name: 'gampaha',
    district: 'GAMPAHA',
    centre: { lat: 7.0873, lng: 79.9925 },
    total: 6,
    pending: 6,
    newestMinutesAgo: 274,
    hazardType: 'ROAD_BLOCKAGE',
  },
  {
    name: 'beruwala',
    district: 'KALUTARA',
    centre: { lat: 6.4788, lng: 79.9828 },
    total: 4,
    pending: 4,
    newestMinutesAgo: 274,
    hazardType: 'ROAD_BLOCKAGE',
  },
  {
    name: 'pelmadulla',
    district: 'RATNAPURA',
    centre: { lat: 6.6205, lng: 80.5419 },
    total: 3,
    pending: 2,
    newestMinutesAgo: 302,
    hazardType: 'OTHER',
  },
];

interface Participants {
  reporterIds: string[];
  officerId: string;
}

/** Look up the actual accounts: seedAuth may have reused accounts with different ids. */
async function participants(ctx: SeedContext): Promise<Participants> {
  const reporterIds: string[] = [];
  // B5's score table uses citizen weights; the volunteer remains available for mobile demos.
  for (const citizen of DEMO_CITIZENS.filter((candidate) => candidate.role === 'CITIZEN')) {
    const user = await ctx.users.findByPhone(normalizePhone(citizen.phone) as string);
    if (!user || user.role !== 'CITIZEN') {
      throw new Error('UC-3 needs the demo citizens. Run seedAuth before seedHazardReports.');
    }
    reporterIds.push(user.userId);
  }
  const officer = await ctx.users.findByEmail('duty.officer@safezone.lk');
  if (!officer || officer.role !== 'DUTY_OFFICER') {
    throw new Error('UC-3 needs the demo duty officer. Run seedAuth before seedHazardReports.');
  }
  return { reporterIds, officerId: officer.userId };
}

/** Deterministic pins on a 450 m ring, comfortably inside the 2 km clustering radius. */
function pin(demo: DemoCluster, index: number): GeoPoint {
  const angle = (index * 2 * Math.PI) / demo.total;
  const delta = 450 / 111_195;
  return {
    lat: demo.centre.lat + delta * Math.sin(angle),
    lng: demo.centre.lng + (delta * Math.cos(angle)) / Math.cos((demo.centre.lat * Math.PI) / 180),
  };
}

function description(demo: DemoCluster, index: number): string {
  if (demo.name === 'kalutara' && index < 3) {
    return `Flood water is rising near the bridge, observation ${index + 1}.`;
  }
  const observation: Record<ReportHazardType, string> = {
    FLOOD: 'Water is covering the road near homes',
    LANDSLIDE: 'Soil has slipped onto the road',
    ROAD_BLOCKAGE: 'Fallen debris is blocking the road',
    OTHER: 'A damaged roadside drain needs inspection',
  };
  return `${observation[demo.hazardType]} in ${demo.name}, observation ${index + 1}.`;
}

function buildReport(
  demo: DemoCluster,
  index: number,
  people: Participants,
  now: Date,
): HazardReport {
  const id = `seed-report-${demo.name}-${String(index + 1).padStart(2, '0')}`;
  const capturedAt = new Date(now.getTime() - (demo.newestMinutesAgo + index * 3) * 60_000);
  const receivedAt = new Date(capturedAt.getTime() + 60_000);
  const rejected = index >= demo.pending;
  return HazardReport.restore({
    id,
    clientReportId: id,
    reporterId: people.reporterIds[index % people.reporterIds.length]!,
    reporterType: 'CITIZEN',
    hazardType: demo.hazardType,
    description: description(demo, index),
    location: { ...pin(demo, index), source: 'GPS', accuracyM: 12 },
    capturedAt,
    receivedAt,
    syncedFromOffline: false,
    status: rejected ? 'REJECTED' : 'PENDING',
    clusterId: `seed-cluster-${demo.name}`,
    ...(rejected
      ? {
          reviewedBy: people.officerId,
          reviewedAt: new Date(receivedAt.getTime() + 60_000),
          rejectionReason: 'The location could not be corroborated.',
        }
      : {}),
  });
}

/** UC-3 B5: upsert only the fixed demo ids, refreshing capture times and recomputing real scores. */
export const seedHazardReports: SeedFunction = async (ctx) => {
  const people = await participants(ctx);
  const now = ctx.clock.now();
  const reports = new MongoHazardReportRepository();
  const clusters = new MongoReportClusterRepository();
  const scorer = new WeightedPriorityScorer(config);
  for (const demo of DEMO_CLUSTERS) {
    const members = Array.from({ length: demo.total }, (_, index) =>
      buildReport(demo, index, people, now),
    );
    const cluster = ReportCluster.open(`seed-cluster-${demo.name}`, members[0]!, demo.district);
    for (const report of members.slice(1)) cluster.add(report);
    cluster.rescore(members, scorer, now);
    for (const report of members) await reports.save(report);
    await clusters.save(cluster);
    const { priorityScore, band, counts } = cluster.snapshot();
    ctx.logger.info('Seeded UC-3 demo cluster', {
      clusterId: cluster.id,
      priorityScore,
      band,
      counts,
    });
  }
};
