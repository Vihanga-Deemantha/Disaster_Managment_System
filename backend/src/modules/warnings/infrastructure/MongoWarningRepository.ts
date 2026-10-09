import type { WarningRepository } from '../application/ports';
import type { WarningStatus } from '../domain/types';
import type { Warning } from '../domain/Warning';
import { docToWarning, warningToDoc } from './mappers';
import { WarningModel, type WarningDoc } from './models';

/** Warnings in MongoDB. `save` is a compare-and-set on `version`, which is what makes a double issue impossible (BR5). */
export class MongoWarningRepository implements WarningRepository {
  async findById(warningId: string): Promise<Warning | null> {
    const doc = await WarningModel.findById(warningId).lean<WarningDoc>();
    return doc ? docToWarning(doc) : null;
  }

  async findByIds(warningIds: readonly string[]): Promise<Warning[]> {
    const docs = await WarningModel.find({ _id: { $in: [...warningIds] } }).lean<WarningDoc[]>();
    return docs.map(docToWarning);
  }

  async findByStatus(status?: WarningStatus): Promise<Warning[]> {
    const docs = await WarningModel.find(status ? { status } : {})
      .sort({ submittedAt: -1, _id: 1 })
      .lean<WarningDoc[]>();
    return docs.map(docToWarning);
  }

  async findBySourceCluster(clusterId: string): Promise<Warning | null> {
    const doc = await WarningModel.findOne({ sourceClusterId: clusterId }).lean<WarningDoc>();
    return doc ? docToWarning(doc) : null;
  }

  async insert(warning: Warning): Promise<void> {
    await WarningModel.create(warningToDoc(warning));
  }

  async save(warning: Warning, expectedVersion: number): Promise<boolean> {
    const doc = warningToDoc(warning);
    const outcome = await WarningModel.replaceOne({ _id: doc._id, version: expectedVersion }, doc);
    return outcome.matchedCount === 1;
  }
}
