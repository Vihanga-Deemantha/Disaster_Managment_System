import type { District } from '@shared/contracts/enums';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { HazardReport } from '../domain/HazardReport';
import type { ReportCluster } from '../domain/ReportCluster';
import type { ClusterStatus, ReportPhoto, ReportStatus, UploadedPhoto } from '../domain/types';

/** Thrown by `insert` when this reporter already sent this `clientReportId` (H7). */
export class DuplicateClientReportError extends Error {
  constructor() {
    super('This clientReportId was already received.');
    this.name = 'DuplicateClientReportError';
  }
}

export interface ReportSearch {
  status?: ReportStatus;
  /** Free text matched against the description. */
  text?: string;
}

export interface HazardReportRepository {
  /** Must be atomic on (reporterId, clientReportId): throws `DuplicateClientReportError` on a repeat. */
  insert(report: HazardReport): Promise<void>;
  save(report: HazardReport): Promise<void>;
  findById(id: string): Promise<HazardReport | undefined>;
  findByClientReportId(
    reporterId: string,
    clientReportId: string,
  ): Promise<HazardReport | undefined>;
  /** Newest capture first. */
  findByReporter(reporterId: string): Promise<HazardReport[]>;
  findByCluster(clusterId: string): Promise<HazardReport[]>;
  /** Newest arrival first, at most 200. */
  search(filter: ReportSearch): Promise<HazardReport[]>;
}

export interface ReportClusterRepository {
  save(cluster: ReportCluster): Promise<void>;
  findById(id: string): Promise<ReportCluster | undefined>;
  /** Open or escalation-recommended clusters whose centroid may lie within `radiusKm` of `point`. */
  findOpenNear(point: GeoPoint, radiusKm: number): Promise<ReportCluster[]>;
  findByStatus(statuses: readonly ClusterStatus[]): Promise<ReportCluster[]>;
}

export interface PhotoStorage {
  /** `key` names the stored file; a new key never overwrites an older photo of the same report. */
  save(key: string, photo: UploadedPhoto): Promise<ReportPhoto>;
  remove(photo: ReportPhoto): Promise<void>;
}

export interface DistrictResolver {
  districtOf(point: GeoPoint): District;
}
