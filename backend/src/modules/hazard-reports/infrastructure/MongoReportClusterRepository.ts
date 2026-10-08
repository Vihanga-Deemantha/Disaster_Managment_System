import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { ReportClusterRepository } from '../application/ports';
import { ReportCluster, type ReportClusterState } from '../domain/ReportCluster';
import type { ClusterStatus } from '../domain/types';
import { compact } from './compact';
import { ReportClusterModel, type ReportClusterDoc } from './models';

const OPEN_STATUSES: ClusterStatus[] = ['OPEN', 'ESCALATION_RECOMMENDED'];
/** Kilometres per degree of latitude, rounded down so the box is always a little larger than the circle. */
const KM_PER_DEGREE = 111;
/** Stops the longitude span from exploding near the poles. */
const MIN_COSINE = 0.01;

export function toClusterDocument({ id, ...rest }: ReportClusterState): ReportClusterDoc {
  return compact({ _id: id, ...rest });
}

export function toClusterState({ _id, ...rest }: ReportClusterDoc): ReportClusterState {
  return { id: _id, ...rest };
}

/** The latitude/longitude rectangle that contains every point within `radiusKm` of `point`. */
function boundingBox(point: GeoPoint, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEGREE;
  const cosine = Math.max(MIN_COSINE, Math.cos((point.lat * Math.PI) / 180));
  const lngDelta = radiusKm / (KM_PER_DEGREE * cosine);
  return {
    'centroid.lat': { $gte: point.lat - latDelta, $lte: point.lat + latDelta },
    'centroid.lng': { $gte: point.lng - lngDelta, $lte: point.lng + lngDelta },
  };
}

const restoreAll = (docs: ReportClusterDoc[]): ReportCluster[] =>
  docs.map((doc) => ReportCluster.restore(toClusterState(doc)));

export class MongoReportClusterRepository implements ReportClusterRepository {
  async save(cluster: ReportCluster): Promise<void> {
    const doc = toClusterDocument(cluster.snapshot());
    await ReportClusterModel.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findById(id: string): Promise<ReportCluster | undefined> {
    const doc = await ReportClusterModel.findById(id).lean<ReportClusterDoc>();
    return doc ? ReportCluster.restore(toClusterState(doc)) : undefined;
  }

  /** A superset: the entity's own haversine check (`canAccept`) does the exact test. */
  async findOpenNear(point: GeoPoint, radiusKm: number): Promise<ReportCluster[]> {
    const docs = await ReportClusterModel.find({
      status: { $in: OPEN_STATUSES },
      ...boundingBox(point, radiusKm),
    }).lean<ReportClusterDoc[]>();
    return restoreAll(docs);
  }

  async findByStatus(statuses: readonly ClusterStatus[]): Promise<ReportCluster[]> {
    const docs = await ReportClusterModel.find({ status: { $in: [...statuses] } }).lean<
      ReportClusterDoc[]
    >();
    return restoreAll(docs);
  }
}
