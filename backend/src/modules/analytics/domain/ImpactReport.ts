import type { ReportMetadata, ReportModel } from './types';
import type { ReportExporter } from '../application/ports';

/** UC-4 steps 12–13 / BR4: report lifecycle and integrity metadata. */
export class ImpactReport {
  constructor(
    readonly metadata: ReportMetadata,
    readonly model: ReportModel,
  ) {}
  render(exporter: ReportExporter): Promise<Buffer> {
    return exporter.export(this.model);
  }
  saveMetadata(checksum: string): ReportMetadata {
    this.metadata.checksum = checksum;
    this.metadata.contentChecksum = this.model.contentChecksum;
    this.metadata.status = 'COMPLETED';
    return this.metadata;
  }
}
