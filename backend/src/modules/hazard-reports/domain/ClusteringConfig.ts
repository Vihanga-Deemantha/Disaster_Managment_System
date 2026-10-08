import type { ReportHazardType, ReporterType } from './types';

/** Every tunable rule of UC-3 in one injected object (report change H5). */
export interface ClusteringConfig {
  clusterRadiusKm: number;
  clusterWindowHours: number;
  duplicateRadiusM: number;
  duplicateWindowMin: number;
  photoMaxBytes: number;
  photoMimeTypes: readonly string[];
  descriptionMaxChars: number;
  /** Weighted report count at which density reaches 1. */
  densityFullAt: number;
  scoreWeights: { density: number; severity: number; recency: number };
  reporterWeights: Record<ReporterType, number>;
  hazardWeights: Record<ReportHazardType, number>;
  bands: { high: number; elevated: number; moderate: number };
  escalationMinVerified: number;
  /** A phone clock may run a little ahead of the server. */
  capturedAtSkewMs: number;
}

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  clusterRadiusKm: 2,
  clusterWindowHours: 6,
  duplicateRadiusM: 200,
  duplicateWindowMin: 30,
  photoMaxBytes: 5 * 1024 * 1024,
  photoMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  descriptionMaxChars: 500,
  densityFullAt: 10,
  scoreWeights: { density: 0.45, severity: 0.3, recency: 0.25 },
  reporterWeights: { CITIZEN: 1, VOLUNTEER: 1.5 },
  hazardWeights: { LANDSLIDE: 1, FLOOD: 0.8, ROAD_BLOCKAGE: 0.5, OTHER: 0.3 },
  bands: { high: 75, elevated: 50, moderate: 30 },
  escalationMinVerified: 3,
  capturedAtSkewMs: 5 * 60_000,
};
