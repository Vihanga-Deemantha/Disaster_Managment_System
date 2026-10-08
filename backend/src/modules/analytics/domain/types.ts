import type { District, HazardType } from '@shared/contracts/enums';
import type { WarningIssued } from '@shared/contracts/events';

export interface CatalogEvent {
  eventId: string;
  name: string;
  hazardType: HazardType;
  districts: District[];
  startDate: string;
  endDate: string;
}
export interface FilterInput {
  eventId?: string;
  district: string;
  hazardType: string;
  from: string;
  to: string;
  organizationId?: string;
}
export interface AlertFact {
  id: string;
  eventId?: string;
  district: District;
  hazardType: HazardType;
  at: string;
  targeted: number;
  reached: number;
  pendingRetry: number;
  failed: number;
  byChannel: WarningIssued['byChannel'];
  officerName?: string;
  citizenIdentifiers?: string[];
}
export interface OccupancyFact {
  id: string;
  eventId?: string;
  district: District;
  hazardType: HazardType;
  at: string;
  shelterId: string;
  shelterName: string;
  occupancy: number;
  capacity: number;
}
export interface DispatchFact {
  id: string;
  eventId?: string;
  district: District;
  hazardType: HazardType | 'UNKNOWN';
  at: string;
  organizationId: string;
  organizationName: string;
  supplyCategory: string;
  quantity: number;
  unit: string;
  officerName?: string;
}
export interface Facts {
  alerts: AlertFact[];
  occupancy: OccupancyFact[];
  distribution: DispatchFact[];
}
export interface ImpactMetrics {
  totals: {
    alertsIssued: number;
    reachPct: number;
    peakOccupancy: number;
    reliefDistributed: { unit: string; quantity: number }[];
  };
  alertTimeline: {
    date: string;
    alerts: number;
    targeted: number;
    reached: number;
    reachPct: number;
  }[];
  byChannel: { channel: string; sent: number; delivered: number; failed: number }[];
  occupancySeries: { date: string; occupancy: number; capacity: number }[];
  distributionByDistrict: {
    district: string;
    unit: string;
    organizationId: string;
    organizationName: string;
    quantity: number;
  }[];
  distributionByOrganisation: {
    organizationId: string;
    organizationName: string;
    unit: string;
    quantity: number;
    sharePct: number;
  }[];
  allocations: DispatchFact[];
  recordCount: number;
}
export const DATASETS = ['alerts', 'occupancy', 'distribution'] as const;
export type Dataset = (typeof DATASETS)[number];
export interface ExportOptions {
  format: 'PDF' | 'CSV';
  audience: 'INTERNAL' | 'EXTERNAL';
  datasets: Dataset[];
}
export interface ReportModel {
  title: string;
  reportId: string;
  filter: FilterInput;
  options: ExportOptions;
  generatedAt: string;
  contentChecksum: string;
  sections: Partial<Facts>;
}
export interface ReportMetadata {
  reportId: string;
  filter: FilterInput;
  options: ExportOptions;
  generatedBy: string;
  generatedAt: string;
  status: 'COMPLETED' | 'FAILED';
  attempts: number;
  checksum?: string;
  contentChecksum?: string;
}
