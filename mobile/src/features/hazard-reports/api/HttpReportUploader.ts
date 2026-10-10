import type { ApiResponse } from '@/shared/api/apiClient';
import { classifySubmitResponse } from '../offline/classifySubmitResponse';
import type { ReportUploader } from '../offline/ports';
import type { QueuedReport, UploadOptions, UploadOutcome } from '../offline/types';
import { buildSubmitParts, type SubmitPart } from './submitParts';

export type SubmitTransport = (parts: SubmitPart[]) => Promise<ApiResponse>;
export class HttpReportUploader implements ReportUploader {
  constructor(private readonly transport: SubmitTransport) {}
  async upload(entry: QueuedReport, options: UploadOptions): Promise<UploadOutcome> {
    try {
      const { status, body } = await this.transport(buildSubmitParts(entry, options));
      return classifySubmitResponse(status, body);
    } catch {
      return { kind: 'RETRY' };
    }
  }
}
