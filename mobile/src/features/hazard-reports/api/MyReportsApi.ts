import type { ApiClient } from '@/shared/api/apiClient';
import type { RemoteReport } from '../domain/mergeMyReports';

/** The server scopes this route to the reporter. Also filter before caching across account changes. */
export class MyReportsApi {
  constructor(private readonly api: ApiClient) {}
  async list(ownerId: string): Promise<RemoteReport[]> {
    const reports = await this.api.request<(RemoteReport & { reporterId: string })[]>(
      'GET',
      '/api/hazard-reports',
    );
    return reports.filter((report) => report.reporterId === ownerId);
  }
}
