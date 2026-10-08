/** UC-4 actor glossary (SC4-01) shared with the dashboard DTOs. */
export const ANALYTICS_ACTORS: Record<string, string> = {
  DMC_OFFICER: 'DMC Officer',
  NGO_MANAGER: 'NGO Manager',
  DONOR: 'Donor',
};
export interface AnalyticsFilter {
  eventId?: string;
  district: string;
  hazardType: string;
  from: string;
  to: string;
  organizationId?: string;
}
export interface CatalogEvent {
  eventId: string;
  name: string;
  hazardType: string;
  districts: string[];
  startDate: string;
  endDate: string;
}
export interface Allocation {
  id: string;
  at: string;
  organizationId: string;
  organizationName: string;
  district: string;
  supplyCategory: string;
  quantity: number;
  unit: string;
}
export interface ImpactMetrics {
  totals: {
    alertsIssued: number;
    reachPct: number;
    peakOccupancy: number;
    reliefDistributed: { quantity: number; unit: string }[];
  };
  alertTimeline: {
    date: string;
    alerts: number;
    targeted: number;
    reached: number;
    reachPct: number;
  }[];
  occupancySeries: { date: string; occupancy: number; capacity: number }[];
  distributionByDistrict: {
    district: string;
    organizationId: string;
    organizationName: string;
    unit: string;
    quantity: number;
  }[];
  distributionByOrganisation: {
    organizationId: string;
    organizationName: string;
    unit: string;
    quantity: number;
    sharePct: number;
  }[];
  allocations: Allocation[];
  recordCount: number;
}
export interface Dashboard {
  filter: AnalyticsFilter;
  metrics: ImpactMetrics;
  generatedAt: string;
}
export type Dataset = 'alerts' | 'occupancy' | 'distribution';
export interface ExportOptions {
  format: 'PDF' | 'CSV';
  audience: 'INTERNAL' | 'EXTERNAL';
  datasets: Dataset[];
}
export interface ReportMetadata {
  reportId: string;
  filter: AnalyticsFilter;
  options: ExportOptions;
  generatedAt: string;
  generatedBy: string;
  status: 'COMPLETED' | 'FAILED';
  attempts: number;
  checksum?: string;
}
export interface EventLog {
  rows: ({ dataset: string; id: string; at: string; district: string } & Record<string, unknown>)[];
  total: number;
  page: number;
  pageSize: number;
}
