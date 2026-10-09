import { distanceKm, type GeoPoint } from '@shared/geo/GeoPoint';
import type { ClusteringConfig } from './ClusteringConfig';
import type { HazardReport } from './HazardReport';

export interface DuplicateCandidate {
  reporterId: string;
  location: GeoPoint;
  capturedAt: Date;
}

export class DuplicateDetector {
  constructor(
    private readonly config: Pick<ClusteringConfig, 'duplicateRadiusM' | 'duplicateWindowMin'>,
  ) {}

  /**
   * UC-3 E3: the same reporter's still-pending report within 200 m and 30 min, nearest in time first.
   * A reviewed report is never a duplicate target: the officer has already acted on it.
   */
  find(candidate: DuplicateCandidate, existing: readonly HazardReport[]): HazardReport | undefined {
    const gapMs = (report: HazardReport): number =>
      Math.abs(report.capturedAt.getTime() - candidate.capturedAt.getTime());
    return existing
      .filter((report) => report.reporterId === candidate.reporterId && report.status === 'PENDING')
      .filter(
        (report) =>
          distanceKm(report.location, candidate.location) * 1000 <= this.config.duplicateRadiusM,
      )
      .filter((report) => gapMs(report) <= this.config.duplicateWindowMin * 60_000)
      .sort((a, b) => gapMs(a) - gapMs(b))[0];
  }
}
