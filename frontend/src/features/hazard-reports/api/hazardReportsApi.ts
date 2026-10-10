import type { ApiClient } from '@/shared/api/apiClient';
import type { ClusterDetail, ClusterSummary, Report, ReportStatus, ReviewResult } from './types';

export interface HistoryFilter {
  status?: ReportStatus;
  q?: string;
}
const BASE = '/api/hazard-reports';
function historyQuery({ status, q }: HistoryFilter): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `?${query}` : '';
}
/** All UC-3 web requests share the session and error handling of the shared client. */
export const hazardReportsApi = (api: ApiClient) => ({
  queue: () => api.get<ClusterSummary[]>(`${BASE}/clusters?status=OPEN,ESCALATION_RECOMMENDED`),
  escalated: () => api.get<ClusterSummary[]>(`${BASE}/clusters?status=ESCALATED`),
  cluster: (id: string) => api.get<ClusterDetail>(`${BASE}/clusters/${encodeURIComponent(id)}`),
  report: (id: string) => api.get<Report>(`${BASE}/${encodeURIComponent(id)}`),
  history: (filter: HistoryFilter) => api.get<Report[]>(`${BASE}${historyQuery(filter)}`),
  mine: () => api.get<Report[]>(BASE),
  verify: (id: string) => api.post<ReviewResult>(`${BASE}/${encodeURIComponent(id)}/verify`),
  reject: (id: string, reason: string) =>
    api.post<ReviewResult>(`${BASE}/${encodeURIComponent(id)}/reject`, { reason }),
  escalate: (id: string) =>
    api.post<ClusterDetail>(`${BASE}/clusters/${encodeURIComponent(id)}/escalate`),
});
export type HazardReportsApi = ReturnType<typeof hazardReportsApi>;
