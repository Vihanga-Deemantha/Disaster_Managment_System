import type { GeoPoint } from '@shared/geo/GeoPoint';
import { HazardReport, type HazardReportState } from '../domain/HazardReport';
import { ReportCluster, type ReportClusterState } from '../domain/ReportCluster';
import type { UploadedPhoto } from '../domain/types';

export const KALUTARA: GeoPoint = { lat: 6.5854, lng: 79.9607 };

/** A point `metres` north of `point` (1 degree of latitude is about 111 195 m). */
export const north = (point: GeoPoint, metres: number): GeoPoint => ({
  lat: point.lat + metres / 111_195,
  lng: point.lng,
});

export const BASE_TIME = new Date('2026-10-07T09:00:00.000Z');
export const minutesAfter = (minutes: number, from: Date = BASE_TIME): Date =>
  new Date(from.getTime() + minutes * 60_000);

export const jpeg = (bytes = 16): UploadedPhoto => ({
  content: Uint8Array.from([0xff, 0xd8, 0xff, ...new Array<number>(bytes - 3).fill(0)]),
  mimeType: 'image/jpeg',
});

/** A stored cluster with sensible defaults: open, one pending flood report (`r-1`) at Kalutara. */
export function aCluster(over: Partial<ReportClusterState> = {}): ReportCluster {
  return ReportCluster.restore({
    id: 'cluster-1',
    centroid: KALUTARA,
    district: 'KALUTARA',
    reportIds: ['r-1'],
    dominantHazardType: 'FLOOD',
    priorityScore: 0,
    band: 'LOW',
    status: 'OPEN',
    counts: { total: 1, pending: 1, verified: 0, rejected: 0 },
    firstReportedAt: BASE_TIME,
    lastReportAt: BASE_TIME,
    ...over,
  });
}

/** A stored report with sensible defaults: one pending citizen flood report at Kalutara. */
export function aReport(over: Partial<HazardReportState> = {}): HazardReport {
  return HazardReport.restore({
    id: 'r-1',
    clientReportId: 'client-0001',
    reporterId: 'citizen-1',
    reporterType: 'CITIZEN',
    hazardType: 'FLOOD',
    description: 'Water is rising',
    location: { ...KALUTARA, source: 'GPS' },
    capturedAt: BASE_TIME,
    receivedAt: BASE_TIME,
    syncedFromOffline: false,
    status: 'PENDING',
    ...over,
  });
}
