import type { ApiClient } from '@/shared/api/apiClient';
import type { SubmitTransport } from '../api/HttpReportUploader';

export function createSubmitTransport(api: ApiClient): SubmitTransport {
  return (parts) => {
    const form = new FormData();
    // React Native's FormData accepts native file descriptors; DOM declarations only describe Blob.
    for (const [name, value] of parts) form.append(name, value as unknown as string);
    return api.send('POST', '/api/hazard-reports', form);
  };
}
