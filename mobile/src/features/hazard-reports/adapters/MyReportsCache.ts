import type { KeyValueStore } from '@/shared/storage/KeyValueStore';
import type { RemoteReport } from '../domain/mergeMyReports';

const keyFor = (owner: string) => `safezone.hazard-reports.mine.v1:${encodeURIComponent(owner)}`;
function isReport(value: unknown): value is RemoteReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<RemoteReport>;
  return (
    typeof report.id === 'string' &&
    typeof report.clientReportId === 'string' &&
    typeof report.description === 'string' &&
    typeof report.capturedAt === 'string' &&
    ['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'].includes(String(report.hazardType)) &&
    ['PENDING', 'VERIFIED', 'REJECTED'].includes(String(report.status))
  );
}
/** Optional server-read cache, separate from the write-ahead journal and scoped to its owner. */
export class MyReportsCache {
  constructor(private readonly storage: KeyValueStore) {}
  async load(ownerId: string): Promise<RemoteReport[]> {
    try {
      const raw = await this.storage.get(keyFor(ownerId));
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      return Array.isArray(parsed) && parsed.every(isReport) ? parsed : [];
    } catch {
      return [];
    }
  }
  async save(ownerId: string, reports: RemoteReport[]): Promise<void> {
    try {
      await this.storage.set(keyFor(ownerId), JSON.stringify(reports));
    } catch {
      /* A cache failure must not hide the fresh list or undo a delivered report. */
    }
  }
}
