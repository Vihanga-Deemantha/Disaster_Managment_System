import type { GeoPoint } from '@shared/geo/GeoPoint';

export const REPORT_HAZARD_TYPES = ['FLOOD', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'OTHER'] as const;
export type ReportHazardType = (typeof REPORT_HAZARD_TYPES)[number];
/** Most severe first: breaks ties when choosing a cluster's dominant hazard type. */
export const HAZARD_SEVERITY_ORDER: readonly ReportHazardType[] = [
  'LANDSLIDE',
  'FLOOD',
  'ROAD_BLOCKAGE',
  'OTHER',
];

export type ReporterType = 'CITIZEN' | 'VOLUNTEER';
export const REPORT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const CLUSTER_STATUSES = ['OPEN', 'ESCALATION_RECOMMENDED', 'ESCALATED', 'CLOSED'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];
export type Band = 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';

export interface ReportLocation extends GeoPoint {
  source: 'GPS' | 'MANUAL';
  accuracyM?: number;
}

export interface ReportPhoto {
  url: string;
  mime: string;
  bytes: number;
}

/** A photo as it arrives, before it is stored. */
export interface UploadedPhoto {
  content: Uint8Array;
  mimeType: string;
}
