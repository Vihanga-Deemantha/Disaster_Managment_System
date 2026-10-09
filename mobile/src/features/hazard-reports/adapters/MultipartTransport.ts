import { File } from 'expo-file-system';
import type { ApiClient } from '@/shared/api/apiClient';
import type { SubmitTransport } from '../api/HttpReportUploader';

export function createSubmitTransport(api: ApiClient): SubmitTransport {
  return (parts) => {
    const form = new FormData();
    // SDK 57 uses expo/fetch, whose encoder reads File.bytes(); URI descriptors are unsupported.
    for (const [name, value] of parts) {
      form.append(name, typeof value === 'string' ? value : new File(value.uri));
    }
    return api.send('POST', '/api/hazard-reports', form);
  };
}
