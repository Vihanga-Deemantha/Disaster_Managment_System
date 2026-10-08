import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@contracts/api';
import type { ApiErrorBody } from '@contracts/api';
import type { ApiClient } from '@/shared/api/apiClient';
import { ApiError } from '@/shared/api/errors';
import type { AnalyticsFilter, ExportOptions } from './types';
export interface Download {
  blob: Blob;
  filename: string;
  checksum: string;
  generatedAt: string;
  attempts: number;
}
/** Binary adapter retains cookie authentication, CSRF and a single session refresh. */
export async function exportReport(
  api: ApiClient,
  filter: AnalyticsFilter,
  options: ExportOptions,
): Promise<Download> {
  const send = () =>
    fetch('/api/analytics/reports', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: CSRF_HEADER_VALUE },
      body: JSON.stringify({ filter, ...options }),
    });
  let response = await send();
  if (response.status === 401 && (await api.refreshSession())) response = await send();
  if (!response.ok) {
    const { error } = (await response.json()) as ApiErrorBody;
    throw new ApiError(response.status, error.code, error.message, error.fields, error.details);
  }
  return readDownload(response, options.format);
}
async function readDownload(
  response: Response,
  format: ExportOptions['format'],
): Promise<Download> {
  return {
    blob: await response.blob(),
    filename:
      response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
      `impact-report.${format.toLowerCase()}`,
    checksum: response.headers.get('X-Report-Checksum') ?? '',
    generatedAt: response.headers.get('X-Report-Generated-At') ?? '',
    attempts: Number(response.headers.get('X-Report-Attempts') ?? 1),
  };
}
export function downloadFile(download: Download): void {
  const url = URL.createObjectURL(download.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = download.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
