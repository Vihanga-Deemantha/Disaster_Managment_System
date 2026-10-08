import type { ModuleFactory } from '@shared/module';
import { composeHazardReportsModule } from '../composition';
import { aCluster, aReport } from './builders';
import {
  FakePhotoStorage,
  fixedDistrict,
  InMemoryHazardReportRepository,
  InMemoryReportClusterRepository,
} from './inMemory';

/**
 * The real module wiring (`composeHazardReportsModule`) over in-memory ports, so an HTTP test
 * exercises routes, guards, services and domain together without MongoDB or a disk.
 */
export function createHttpFixture() {
  const reports = new InMemoryHazardReportRepository();
  const clusters = new InMemoryReportClusterRepository();
  const photos = new FakePhotoStorage();
  /** File name -> absolute path of a photo the test placed on disk. */
  const photoFiles = new Map<string, string>();
  const factory: ModuleFactory = (ctx) =>
    composeHazardReportsModule(ctx, {
      reports,
      clusters,
      photos,
      districts: fixedDistrict('KALUTARA'),
      resolvePhoto: (fileName) => photoFiles.get(fileName),
    });

  /** A cluster of `count` flood reports captured "now", the first `verified` already verified. */
  async function seedCluster(
    options: { clusterId?: string; count?: number; verified?: number } = {},
  ) {
    const { clusterId = 'c1', count = 10, verified = 0 } = options;
    const ids = Array.from({ length: count }, (_, index) => `${clusterId}-r${index + 1}`);
    for (const [index, id] of ids.entries()) {
      await reports.save(
        aReport({
          id,
          clientReportId: `client-${id}`,
          reporterId: `citizen-${index + 1}`,
          clusterId,
          status: index < verified ? 'VERIFIED' : 'PENDING',
        }),
      );
    }
    await clusters.save(aCluster({ id: clusterId, reportIds: ids }));
    return ids;
  }

  return { factory, reports, clusters, photos, photoFiles, seedCluster };
}
