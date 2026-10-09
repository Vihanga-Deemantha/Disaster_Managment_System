import { useState } from 'react';
import { ApiError, NetworkError } from '@/shared/api/errors';
import type { HazardReportsApi } from '../api/hazardReportsApi';
import type { ReviewResult } from '../api/types';

export type ReviewAction = 'verify' | 'reject';
export interface ReviewReceipt {
  action: ReviewAction;
  value: ReviewResult;
}

function refreshWarningQueue(action: ReviewAction): void {
  if (action === 'verify') window.dispatchEvent(new Event('safezone:warning-request-created'));
}
export function useReportReview(client: HazardReportsApi, id: string, reload: () => void) {
  const [receipt, setReceipt] = useState<ReviewReceipt>();
  async function review(action: ReviewAction, reason = ''): Promise<void> {
    if (!navigator.onLine) throw new NetworkError();
    try {
      const value = action === 'verify' ? await client.verify(id) : await client.reject(id, reason);
      refreshWarningQueue(action);
      setReceipt({ action, value });
      reload();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'REPORT_ALREADY_REVIEWED'
      )
        reload();
      throw error;
    }
  }
  return { receipt, review };
}
