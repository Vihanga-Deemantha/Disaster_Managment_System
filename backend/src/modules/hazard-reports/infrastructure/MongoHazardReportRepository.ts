import {
  DuplicateClientReportError,
  type HazardReportRepository,
  type ReportSearch,
} from '../application/ports';
import { HazardReport, type HazardReportState } from '../domain/HazardReport';
import { compact } from './compact';
import { HazardReportModel, type HazardReportDoc } from './models';

const SEARCH_LIMIT = 200;
const DUPLICATE_KEY = 11000;

export function toReportDocument({ id, ...rest }: HazardReportState): HazardReportDoc {
  return compact({ _id: id, ...rest, location: compact(rest.location) });
}

export function toReportState({ _id, ...rest }: HazardReportDoc): HazardReportState {
  return { id: _id, ...rest };
}

/** True only for a collision on the (reporterId, clientReportId) index: any other 11000 is a real fault. */
function isReplay(error: unknown): boolean {
  const { code, keyPattern } = error as { code?: number; keyPattern?: Record<string, unknown> };
  return code === DUPLICATE_KEY && keyPattern !== undefined && 'clientReportId' in keyPattern;
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const restoreAll = (docs: HazardReportDoc[]): HazardReport[] =>
  docs.map((doc) => HazardReport.restore(toReportState(doc)));

export class MongoHazardReportRepository implements HazardReportRepository {
  async insert(report: HazardReport): Promise<void> {
    try {
      await HazardReportModel.create(toReportDocument(report.snapshot()));
    } catch (error) {
      if (isReplay(error)) throw new DuplicateClientReportError();
      throw error;
    }
  }

  async save(report: HazardReport): Promise<void> {
    const doc = toReportDocument(report.snapshot());
    await HazardReportModel.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  async findById(id: string): Promise<HazardReport | undefined> {
    return this.one(await HazardReportModel.findById(id).lean<HazardReportDoc>());
  }

  async findByClientReportId(
    reporterId: string,
    clientReportId: string,
  ): Promise<HazardReport | undefined> {
    const doc = await HazardReportModel.findOne({
      reporterId,
      clientReportId,
    }).lean<HazardReportDoc>();
    return this.one(doc);
  }

  async findByReporter(reporterId: string): Promise<HazardReport[]> {
    const docs = await HazardReportModel.find({ reporterId })
      .sort({ capturedAt: -1 })
      .lean<HazardReportDoc[]>();
    return restoreAll(docs);
  }

  async findByCluster(clusterId: string): Promise<HazardReport[]> {
    const docs = await HazardReportModel.find({ clusterId })
      .sort({ capturedAt: 1 })
      .lean<HazardReportDoc[]>();
    return restoreAll(docs);
  }

  async search({ status, text }: ReportSearch): Promise<HazardReport[]> {
    const docs = await HazardReportModel.find({
      ...(status ? { status } : {}),
      ...(text ? { description: { $regex: escapeRegex(text), $options: 'i' } } : {}),
    })
      .sort({ receivedAt: -1 })
      .limit(SEARCH_LIMIT)
      .lean<HazardReportDoc[]>();
    return restoreAll(docs);
  }

  private one(doc: HazardReportDoc | null): HazardReport | undefined {
    return doc ? HazardReport.restore(toReportState(doc)) : undefined;
  }
}
