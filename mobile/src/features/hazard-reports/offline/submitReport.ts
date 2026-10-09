import type { ReportDraft } from '../domain/types';
import { validateReportDraft, type DraftProblem } from '../domain/validateReportDraft';
import type { OfflineReportQueue } from './OfflineReportQueue';
import type { SubmitNowResult, SyncManager } from './SyncManager';

export type SubmitFlowResult =
  { kind: 'INVALID'; problems: DraftProblem[] } | (SubmitNowResult & { clientReportId: string });
export interface SubmitFlowDeps {
  queue: Pick<OfflineReportQueue, 'enqueue' | 'get' | 'update' | 'dropPhoto'>;
  sync: Pick<SyncManager, 'submitNow'>;
}

/** Save evidence before any network request; a failed journal write cannot claim success. */
export async function submitReport(
  deps: SubmitFlowDeps,
  ownerId: string,
  draft: ReportDraft,
): Promise<SubmitFlowResult> {
  const checked = validateReportDraft(draft);
  if (!checked.ok) return { kind: 'INVALID', problems: checked.problems };
  const { clientReportId } = await deps.queue.enqueue(ownerId, checked.value);
  return { ...(await deps.sync.submitNow(clientReportId)), clientReportId };
}

export async function answerDuplicate(
  deps: SubmitFlowDeps,
  ownerId: string,
  id: string,
  action: 'NEW' | 'UPDATE',
): Promise<SubmitNowResult> {
  const entry = await deps.queue.get(id);
  if (!entry) return { kind: 'ALREADY_SENT' };
  if (entry.ownerId !== ownerId) return { kind: 'AUTH_REQUIRED' };
  await deps.queue.update(id, {
    state: 'QUEUED',
    existingReportId: undefined,
    problem: undefined,
    duplicateAction: action,
  });
  return deps.sync.submitNow(id, action);
}

export async function sendWithoutPhoto(
  deps: SubmitFlowDeps,
  ownerId: string,
  id: string,
): Promise<SubmitNowResult> {
  const entry = await deps.queue.get(id);
  if (!entry) return { kind: 'ALREADY_SENT' };
  if (entry.ownerId !== ownerId) return { kind: 'AUTH_REQUIRED' };
  await deps.queue.dropPhoto(id);
  return deps.sync.submitNow(id);
}
