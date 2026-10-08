import { ApiError, NetworkError } from '@/shared/api/errors';
import type { HazardReportsApi } from '../api/hazardReportsApi';

export function escalationRequest(client: HazardReportsApi, id: string, reload: () => void) {
  return async () => {
    if (!navigator.onLine) throw new NetworkError();
    try {
      await client.escalate(id);
      reload();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'ESCALATION_NOT_ALLOWED'
      )
        reload();
      throw error;
    }
  };
}
