import type { AnalyticsStore } from '../application/ports';
import type { AnalyticsFilter } from '../domain/AnalyticsFilter';
import type {
  AlertFact,
  CatalogEvent,
  DispatchFact,
  OccupancyFact,
  ReportMetadata,
} from '../domain/types';
export class MemoryAnalyticsStore implements AnalyticsStore {
  events = new Map<string, CatalogEvent>();
  alerts = new Map<string, AlertFact>();
  occupancy = new Map<string, OccupancyFact>();
  dispatches = new Map<string, DispatchFact>();
  history: ReportMetadata[] = [];
  async list() {
    return [...this.events.values()];
  }
  async putEvent(e: CatalogEvent) {
    this.events.set(e.eventId, e);
  }
  async putAlert(f: AlertFact) {
    if (!this.alerts.has(f.id)) this.alerts.set(f.id, f);
  }
  async putOccupancy(f: OccupancyFact) {
    if (!this.occupancy.has(f.id)) this.occupancy.set(f.id, f);
  }
  async putDispatch(f: DispatchFact) {
    if (!this.dispatches.has(f.id)) this.dispatches.set(f.id, f);
  }
  async countReach(f: AnalyticsFilter) {
    return [...this.alerts.values()].filter((row) => f.matches(row));
  }
  async occupancySeries(f: AnalyticsFilter) {
    return [...this.occupancy.values()].filter((row) => f.matches(row));
  }
  async distributionByDistrict(f: AnalyticsFilter) {
    return [...this.dispatches.values()].filter(
      (row) =>
        f.matches(row) &&
        (!f.value.organizationId || row.organizationId === f.value.organizationId),
    );
  }
  async saveReport(report: ReportMetadata) {
    this.history.push(report);
  }
  async reports(owner?: string) {
    return this.history
      .filter((row) => !owner || row.generatedBy === owner)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }
}
