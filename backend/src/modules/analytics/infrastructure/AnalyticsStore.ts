import mongoose, { Schema } from 'mongoose';
import type { AnalyticsStore } from '../application/ports';
import type { AnalyticsFilter } from '../domain/AnalyticsFilter';
import type {
  AlertFact,
  CatalogEvent,
  DispatchFact,
  OccupancyFact,
  ReportMetadata,
} from '../domain/types';
function model<T>(name: string, collection: string) {
  return mongoose.model<{ key: string; value: T }>(
    name,
    new Schema(
      {
        key: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed, required: true },
      },
      { collection, versionKey: false },
    ),
  );
}
const Events = model<CatalogEvent>('AnalyticsEvent', 'analytics_events');
const Alerts = model<AlertFact>('AnalyticsAlert', 'analytics_alerts');
const Occupancy = model<OccupancyFact>('AnalyticsOccupancy', 'analytics_occupancy');
const Dispatches = model<DispatchFact>('AnalyticsDispatch', 'analytics_dispatches');
const Reports = model<ReportMetadata>('AnalyticsReport', 'analytics_reports');
/** CD-10: owned projections; source IDs make event replay idempotent. */
export class MongoAnalyticsStore implements AnalyticsStore {
  async list() {
    return (await Events.find().lean()).map((row) => row.value);
  }
  async putEvent(event: CatalogEvent) {
    await Events.updateOne({ key: event.eventId }, { $set: { value: event } }, { upsert: true });
  }
  async putAlert(fact: AlertFact) {
    await Alerts.updateOne({ key: fact.id }, { $setOnInsert: { value: fact } }, { upsert: true });
  }
  async putOccupancy(fact: OccupancyFact) {
    await Occupancy.updateOne(
      { key: fact.id },
      { $setOnInsert: { value: fact } },
      { upsert: true },
    );
  }
  async putDispatch(fact: DispatchFact) {
    await Dispatches.updateOne(
      { key: fact.id },
      { $setOnInsert: { value: fact } },
      { upsert: true },
    );
  }
  async countReach(filter: AnalyticsFilter) {
    return (await Alerts.find().lean()).map((row) => row.value).filter((f) => filter.matches(f));
  }
  async occupancySeries(filter: AnalyticsFilter) {
    return (await Occupancy.find().lean()).map((row) => row.value).filter((f) => filter.matches(f));
  }
  async distributionByDistrict(filter: AnalyticsFilter) {
    return (await Dispatches.find().lean())
      .map((row) => row.value)
      .filter(
        (f) =>
          filter.matches(f) &&
          (!filter.value.organizationId || f.organizationId === filter.value.organizationId),
      );
  }
  async saveReport(report: ReportMetadata) {
    await Reports.create({ key: report.reportId, value: report });
  }
  async reports(ownerId?: string) {
    return (await Reports.find(ownerId ? { 'value.generatedBy': ownerId } : {}).lean())
      .map((row) => row.value)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }
}
