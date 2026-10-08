import type { District } from '@shared/contracts/enums';
import {
  DuplicateClientReportError,
  type DistrictResolver,
  type HazardReportRepository,
  type PhotoStorage,
  type ReportClusterRepository,
  type ReportSearch,
} from '../application/ports';
import { HazardReport, type HazardReportState } from '../domain/HazardReport';
import { ReportCluster, type ReportClusterState } from '../domain/ReportCluster';
import type { ClusterStatus, ReportPhoto, UploadedPhoto } from '../domain/types';

const SEARCH_LIMIT = 200;
const OPEN_STATUSES: readonly ClusterStatus[] = ['OPEN', 'ESCALATION_RECOMMENDED'];

/**
 * Stores snapshots and hands out fresh entities, exactly like a database would: changing an entity
 * only counts once it has been saved.
 */
export class InMemoryHazardReportRepository implements HazardReportRepository {
  protected readonly rows = new Map<string, HazardReportState>();

  async insert(report: HazardReport): Promise<void> {
    const { reporterId, clientReportId } = report.snapshot();
    const taken = [...this.rows.values()].some(
      (row) => row.reporterId === reporterId && row.clientReportId === clientReportId,
    );
    if (taken) throw new DuplicateClientReportError();
    await this.save(report);
  }

  async save(report: HazardReport): Promise<void> {
    this.rows.set(report.id, report.snapshot());
  }

  async findById(id: string): Promise<HazardReport | undefined> {
    return this.restore(this.rows.get(id));
  }

  async findByClientReportId(
    reporterId: string,
    clientReportId: string,
  ): Promise<HazardReport | undefined> {
    return this.restore(
      this.all().find(
        (row) => row.reporterId === reporterId && row.clientReportId === clientReportId,
      ),
    );
  }

  async findByReporter(reporterId: string): Promise<HazardReport[]> {
    const mine = this.all().filter((row) => row.reporterId === reporterId);
    return this.restoreAll(mine.sort(newestCapture));
  }

  async findByCluster(clusterId: string): Promise<HazardReport[]> {
    return this.restoreAll(this.all().filter((row) => row.clusterId === clusterId));
  }

  async search({ status, text }: ReportSearch): Promise<HazardReport[]> {
    const needle = text?.toLowerCase();
    const found = this.all()
      .filter((row) => !status || row.status === status)
      .filter((row) => !needle || row.description.toLowerCase().includes(needle))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return this.restoreAll(found.slice(0, SEARCH_LIMIT));
  }

  private all(): HazardReportState[] {
    return [...this.rows.values()];
  }

  private restore(row: HazardReportState | undefined): HazardReport | undefined {
    return row ? HazardReport.restore(row) : undefined;
  }

  private restoreAll(rows: HazardReportState[]): HazardReport[] {
    return rows.map((row) => HazardReport.restore(row));
  }
}

const newestCapture = (a: HazardReportState, b: HazardReportState): number =>
  b.capturedAt.getTime() - a.capturedAt.getTime();

export class InMemoryReportClusterRepository implements ReportClusterRepository {
  private readonly rows = new Map<string, ReportClusterState>();

  async save(cluster: ReportCluster): Promise<void> {
    this.rows.set(cluster.id, cluster.snapshot());
  }

  async findById(id: string): Promise<ReportCluster | undefined> {
    const row = this.rows.get(id);
    return row ? ReportCluster.restore(row) : undefined;
  }

  /** Returns every open cluster: the entity's own check does the exact distance test. */
  async findOpenNear(): Promise<ReportCluster[]> {
    return this.findByStatus(OPEN_STATUSES);
  }

  async findByStatus(statuses: readonly ClusterStatus[]): Promise<ReportCluster[]> {
    return [...this.rows.values()]
      .filter((row) => statuses.includes(row.status))
      .map((row) => ReportCluster.restore(row));
  }
}

/** Remembers what was stored and removed, so a test can assert on both. */
export class FakePhotoStorage implements PhotoStorage {
  readonly saved: { key: string; photo: ReportPhoto }[] = [];
  readonly removed: ReportPhoto[] = [];

  async save(key: string, photo: UploadedPhoto): Promise<ReportPhoto> {
    const stored = {
      url: `/api/hazard-reports/photos/${key}.jpg`,
      mime: photo.mimeType,
      bytes: photo.content.byteLength,
    };
    this.saved.push({ key, photo: stored });
    return stored;
  }

  async remove(photo: ReportPhoto): Promise<void> {
    this.removed.push(photo);
  }
}

export const fixedDistrict = (district: District = 'KALUTARA'): DistrictResolver => ({
  districtOf: () => district,
});
