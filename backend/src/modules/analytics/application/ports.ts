import type { AnalyticsFilter } from '../domain/AnalyticsFilter';
import type {
  AlertFact,
  CatalogEvent,
  DispatchFact,
  OccupancyFact,
  ReportMetadata,
  ReportModel,
} from '../domain/types';

/** CD-10: ports read UC-4 projections only, never another module's collections. */
export interface AlertNotificationReadModel {
  countReach(filter: AnalyticsFilter): Promise<AlertFact[]>;
}
export interface ShelterOccupancyLogReadModel {
  occupancySeries(filter: AnalyticsFilter): Promise<OccupancyFact[]>;
}
export interface ResourceDispatchReadModel {
  distributionByDistrict(filter: AnalyticsFilter): Promise<DispatchFact[]>;
}
export interface EventCatalog {
  list(): Promise<CatalogEvent[]>;
}
export interface AnalyticsStore
  extends
    AlertNotificationReadModel,
    ShelterOccupancyLogReadModel,
    ResourceDispatchReadModel,
    EventCatalog {
  putEvent(event: CatalogEvent): Promise<void>;
  putAlert(fact: AlertFact): Promise<void>;
  putOccupancy(fact: OccupancyFact): Promise<void>;
  putDispatch(fact: DispatchFact): Promise<void>;
  saveReport(report: ReportMetadata): Promise<void>;
  reports(ownerId?: string): Promise<ReportMetadata[]>;
}
export interface ReportExporter {
  export(model: ReportModel): Promise<Buffer>;
}
export interface ExporterFactory {
  create(format: string): ReportExporter;
}
export interface ChecksumCalculator {
  calculate(bytes: Buffer): string;
}
